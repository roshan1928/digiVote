import React, { Component } from "react";

import Navbar from "../../Navbar/Navigation";
import NavbarAdmin from "../../Navbar/NavigationAdmin";

import getWeb3 from "../../../getWeb3";
import Election from "../../../contracts/Election.json";

import AdminOnly from "../../AdminOnly";

import * as XLSX from "xlsx"; // ✅ Excel reader

import "./AddCandidate.css";

export default class AddCandidate extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      web3: null,
      account: null,
      isAdmin: false,

      // manual form fields
      name: "",
      party: "",
      symbol: "",
      age: "",
      gender: "",
      region: "",

      candidates: [],
      candidateCount: 0,

      // excel upload status
      uploading: false,
      uploadMsg: "",
    };
  }

  componentDidMount = async () => {
    // refreshing page only once (keep your behavior)
    if (!window.location.hash) {
      window.location = window.location + "#loaded";
      window.location.reload();
    }

    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();

      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        alert("Smart contract not deployed to the detected network.");
        return;
      }

      const instance = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      this.setState({
        web3,
        ElectionInstance: instance,
        account: accounts[0],
      });

      // ✅ candidateCount is now a public variable in upgraded contract
      const candidateCount = await instance.methods.candidateCount().call();
      this.setState({ candidateCount: Number(candidateCount) });

      // ✅ admin is now public variable => admin()
      const admin = await instance.methods.admin().call();
      if (accounts[0].toLowerCase() === admin.toLowerCase()) {
        this.setState({ isAdmin: true });
      }

      await this.loadCandidates(instance, Number(candidateCount));
    } catch (error) {
      console.error(error);
      alert("Failed to load web3, accounts, or contract. Check console.");
    }
  };

  loadCandidates = async (instance, count) => {
    const candidates = [];
    for (let i = 0; i < count; i++) {
      const c = await instance.methods.candidateDetails(i).call();
      candidates.push({
        id: Number(c.candidateId),
        name: c.name,
        party: c.party,
        symbol: c.symbol,
        age: Number(c.age),
        gender: c.gender,
        region: c.region,
        voteCount: Number(c.voteCount),
      });
    }
    this.setState({ candidates });
  };

  // ---------------- Manual Form Handlers ----------------
  handleChange = (key) => (e) => {
    this.setState({ [key]: e.target.value });
  };

  addCandidate = async (e) => {
    e.preventDefault();
    try {
      const { ElectionInstance, account } = this.state;

      const ageNum = Number(this.state.age);
      if (!Number.isFinite(ageNum) || ageNum <= 0) {
        alert("Please enter a valid age.");
        return;
      }

      await ElectionInstance.methods
        .addCandidate(
          this.state.name.trim(),
          this.state.party.trim(),
          this.state.symbol.trim(),
          ageNum,
          this.state.gender.trim(),
          this.state.region.trim()
        )
        .send({ from: account, gas: 1500000 });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error adding candidate");
    }
  };

  // ---------------- Excel Upload ----------------
  // Expected columns: name, party, symbol, age, gender, region
  onExcelSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      this.setState({ uploading: true, uploadMsg: "Reading file..." });

      const rows = await this.readExcel(file);

      if (!rows.length) {
        this.setState({ uploading: false, uploadMsg: "No rows found in Excel." });
        return;
      }

      // normalize + validate rows
      const cleaned = rows
        .map((r) => ({
          name: (r.name ?? r.Name ?? "").toString().trim(),
          party: (r.party ?? r.Party ?? "").toString().trim(),
          symbol: (r.symbol ?? r.Symbol ?? "").toString().trim(),
          age: Number(r.age ?? r.Age ?? 0),
          gender: (r.gender ?? r.Gender ?? "").toString().trim(),
          region: (r.region ?? r.Region ?? "").toString().trim(),
        }))
        .filter((r) => r.name && r.party && r.symbol && r.age > 0 && r.gender && r.region);

      if (!cleaned.length) {
        this.setState({
          uploading: false,
          uploadMsg:
            "No valid rows. Required columns: name, party, symbol, age, gender, region",
        });
        return;
      }

      await this.uploadCandidatesInChunks(cleaned);

      this.setState({ uploading: false, uploadMsg: "✅ Upload complete!" });
      window.location.reload();
    } catch (err) {
      console.error(err);
      this.setState({ uploading: false, uploadMsg: "❌ Upload failed. Check console." });
    }
  };

  readExcel = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          resolve(json);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });

  uploadCandidatesInChunks = async (rows) => {
    const { ElectionInstance, account } = this.state;

    const CHUNK = 25; // ✅ safe size for Ganache (adjust if needed)

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const names = chunk.map((r) => r.name);
      const parties = chunk.map((r) => r.party);
      const symbols = chunk.map((r) => r.symbol);
      const ages = chunk.map((r) => r.age);
      const genders = chunk.map((r) => r.gender);
      const regions = chunk.map((r) => r.region);

      this.setState({
        uploadMsg: `Uploading ${i + 1}-${Math.min(i + CHUNK, rows.length)} of ${
          rows.length
        }...`,
      });

      await ElectionInstance.methods
        .addCandidatesBatch(names, parties, symbols, ages, genders, regions)
        .send({ from: account, gas: 5000000 });
    }
  };

  render() {
    if (!this.state.web3) {
      return (
        <>
          {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}
          <center>Loading Web3, accounts, and contract...</center>
        </>
      );
    }

    if (!this.state.isAdmin) {
      return (
        <>
          <Navbar />
          <AdminOnly page="Add Candidate Page." />
        </>
      );
    }

    return (
      <>
        <NavbarAdmin />

        <div className="container-main">
          <h2>Add candidates</h2>
          <small>Total candidates: {this.state.candidateCount}</small>

          {/* ✅ Excel Upload */}
          <div className="container-item">
            <div style={{ width: "100%" }}>
              <h3 style={{ marginBottom: "10px" }}>Upload by Excel (.xlsx)</h3>
              <p style={{ marginTop: 0 }}>
                Required columns: <code>name, party, symbol, age, gender, region</code>
              </p>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={this.onExcelSelected}
                disabled={this.state.uploading}
              />

              {this.state.uploadMsg && (
                <p style={{ marginTop: "10px" }}>{this.state.uploadMsg}</p>
              )}
            </div>
          </div>

          {/* ✅ Manual Add */}
          <div className="container-item">
            <form className="form" onSubmit={this.addCandidate}>
              <label className={"label-ac"}>
                Candidate Name
                <input
                  className={"input-ac"}
                  type="text"
                  placeholder="e.g. Tom"
                  value={this.state.name}
                  onChange={this.handleChange("name")}
                />
              </label>

              <label className={"label-ac"}>
                Party
                <input
                  className={"input-ac"}
                  type="text"
                  placeholder="e.g. ABC Party"
                  value={this.state.party}
                  onChange={this.handleChange("party")}
                />
              </label>

              <label className={"label-ac"}>
                Symbol (URL or text)
                <input
                  className={"input-ac"}
                  type="text"
                  placeholder="e.g. https://.../symbol.png"
                  value={this.state.symbol}
                  onChange={this.handleChange("symbol")}
                />
              </label>

              <label className={"label-ac"}>
                Age
                <input
                  className={"input-ac"}
                  type="number"
                  placeholder="e.g. 35"
                  value={this.state.age}
                  onChange={this.handleChange("age")}
                />
              </label>

              <label className={"label-ac"}>
                Gender
                <input
                  className={"input-ac"}
                  type="text"
                  placeholder="e.g. Male/Female/Other"
                  value={this.state.gender}
                  onChange={this.handleChange("gender")}
                />
              </label>

              <label className={"label-ac"}>
                Region
                <input
                  className={"input-ac"}
                  type="text"
                  placeholder="e.g. Kathmandu"
                  value={this.state.region}
                  onChange={this.handleChange("region")}
                />
              </label>

              <button
                className="btn-add"
                type="submit"
                disabled={
                  this.state.name.trim().length < 2 ||
                  this.state.party.trim().length < 2 ||
                  this.state.symbol.trim().length < 1 ||
                  Number(this.state.age) <= 0 ||
                  this.state.gender.trim().length < 2 ||
                  this.state.region.trim().length < 2
                }
              >
                Add Candidate
              </button>
            </form>
          </div>
        </div>

        {loadAdded(this.state.candidates)}
      </>
    );
  }
}

// ✅ Updated list renderer (shows new fields)
export function loadAdded(candidates) {
  const renderAdded = (candidate) => {
    return (
      <div className="container-list success" key={candidate.id}>
        <div style={{ maxHeight: "60px", overflow: "auto" }}>
          <strong>
            {candidate.id}. {candidate.name}
          </strong>{" "}
          | {candidate.party} | {candidate.gender}, {candidate.age} |{" "}
          {candidate.region}
          <br />
          <small>Symbol: {candidate.symbol}</small>
        </div>
      </div>
    );
  };

  return (
    <div className="container-main" style={{ borderTop: "1px solid" }}>
      <div className="container-item info">
        <center>Candidates List</center>
      </div>

      {candidates.length < 1 ? (
        <div className="container-item alert">
          <center>No candidates added.</center>
        </div>
      ) : (
        <div
          className="container-item"
          style={{
            display: "block",
            backgroundColor: "#DDFFFF",
          }}
        >
          {candidates.map(renderAdded)}
        </div>
      )}
    </div>
  );
}