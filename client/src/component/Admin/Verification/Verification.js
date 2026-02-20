import React, { Component } from "react";

import Navbar from "../../Navbar/Navigation";
import NavbarAdmin from "../../Navbar/NavigationAdmin";

import AdminOnly from "../../AdminOnly";

import getWeb3 from "../../../getWeb3";
import Election from "../../../contracts/Election.json";

import * as XLSX from "xlsx"; // ✅ Excel upload

import "./Verification.css";

export default class Verification extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      account: null,
      web3: null,
      isAdmin: false,
      voterCount: 0,
      voters: [],

      uploading: false,
      uploadMsg: "",
    };
  }

  componentDidMount = async () => {
    // refreshing once
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

      this.setState({ web3, ElectionInstance: instance, account: accounts[0] });

      // ✅ Admin check
      const admin = await instance.methods.admin().call();
      const isAdmin = accounts[0].toLowerCase() === admin.toLowerCase();
      this.setState({ isAdmin });

      // ✅ Total voters
      const voterCount = await instance.methods.voterCount().call();
      this.setState({ voterCount: Number(voterCount) });

      await this.loadVoters(instance, Number(voterCount));
    } catch (error) {
      alert("Failed to load web3, accounts, or contract. Check console.");
      console.error(error);
    }
  };

  loadVoters = async (instance, count) => {
    const voters = [];
    for (let i = 0; i < count; i++) {
      const voterAddress = await instance.methods.voters(i).call();
      const v = await instance.methods.voterDetails(voterAddress).call();

      voters.push({
        address: v.voterAddress,
        name: v.name,
        phone: v.phone,
        email: v.email,
        age: Number(v.age),
        gender: v.gender,
        region: v.region,
        hasVoted: v.hasVoted,
        isVerified: v.isVerified,
        isRegistered: v.isRegistered,
      });
    }
    this.setState({ voters });
  };

  // ✅ Approve/Reject voter
  verifyVoter = async (verifiedStatus, address) => {
    try {
      await this.state.ElectionInstance.methods
        .verifyVoter(verifiedStatus, address)
        .send({ from: this.state.account, gas: 1000000 });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Verification failed");
    }
  };

  /* ---------------- Excel Upload for Voters ----------------
     Required columns:
     address, name, phone, email, age, gender, region
  */
  onExcelSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      this.setState({ uploading: true, uploadMsg: "Reading Excel..." });

      const rows = await this.readExcel(file);

      const cleaned = rows
        .map((r) => ({
          address: (r.address ?? r.Address ?? "").toString().trim(),
          name: (r.name ?? r.Name ?? "").toString().trim(),
          phone: (r.phone ?? r.Phone ?? "").toString().trim(),
          email: (r.email ?? r.Email ?? "").toString().trim(),
          age: Number(r.age ?? r.Age ?? 0),
          gender: (r.gender ?? r.Gender ?? "").toString().trim(),
          region: (r.region ?? r.Region ?? "").toString().trim(),
        }))
        .filter(
          (r) =>
            r.address &&
            r.name &&
            r.phone &&
            r.email &&
            r.age > 0 &&
            r.gender &&
            r.region
        );

      if (!cleaned.length) {
        this.setState({
          uploading: false,
          uploadMsg:
            "No valid rows. Required: address, name, phone, email, age, gender, region",
        });
        return;
      }

      await this.registerVotersInChunks(cleaned);

      this.setState({
        uploading: false,
        uploadMsg: "✅ Voters uploaded successfully!",
      });
      window.location.reload();
    } catch (err) {
      console.error(err);
      this.setState({
        uploading: false,
        uploadMsg: "❌ Upload failed. Check console.",
      });
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

  registerVotersInChunks = async (rows) => {
    const { ElectionInstance, account } = this.state;
    const CHUNK = 20; // safe for ganache

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const addrs = chunk.map((r) => r.address);
      const names = chunk.map((r) => r.name);
      const phones = chunk.map((r) => r.phone);
      const emails = chunk.map((r) => r.email);
      const ages = chunk.map((r) => r.age);
      const genders = chunk.map((r) => r.gender);
      const regions = chunk.map((r) => r.region);

      this.setState({
        uploadMsg: `Uploading ${i + 1}-${Math.min(i + CHUNK, rows.length)} of ${
          rows.length
        }...`,
      });

      await ElectionInstance.methods
        .registerVotersBatch(addrs, names, phones, emails, ages, genders, regions)
        .send({ from: account, gas: 5000000 });
    }
  };

  renderVoterCard = (voter) => {
    const verifiedBlock = voter.isVerified ? (
      <div className="container-list success" key={`${voter.address}-verified`}>
        <p style={{ margin: "7px 0px" }}>AC: {voter.address}</p>
        <table>
          <tbody>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Region</th>
              <th>Voted</th>
            </tr>
            <tr>
              <td>{voter.name}</td>
              <td>{voter.phone}</td>
              <td>{voter.email}</td>
              <td>{voter.age}</td>
              <td>{voter.gender}</td>
              <td>{voter.region}</td>
              <td>{voter.hasVoted ? "True" : "False"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    ) : null;

    const unverifiedBlock = (
      <div
        className="container-list attention"
        style={{ display: voter.isVerified ? "none" : undefined }}
        key={`${voter.address}-unverified`}
      >
        <table>
          <tbody>
            <tr>
              <th>Account address</th>
              <td>{voter.address}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>{voter.name}</td>
            </tr>
            <tr>
              <th>Phone</th>
              <td>{voter.phone}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>{voter.email}</td>
            </tr>
            <tr>
              <th>Age</th>
              <td>{voter.age}</td>
            </tr>
            <tr>
              <th>Gender</th>
              <td>{voter.gender}</td>
            </tr>
            <tr>
              <th>Region</th>
              <td>{voter.region}</td>
            </tr>
            <tr>
              <th>Voted</th>
              <td>{voter.hasVoted ? "True" : "False"}</td>
            </tr>
            <tr>
              <th>Verified</th>
              <td>{voter.isVerified ? "True" : "False"}</td>
            </tr>
            <tr>
              <th>Registered</th>
              <td>{voter.isRegistered ? "True" : "False"}</td>
            </tr>
          </tbody>
        </table>

        <div>
          <button
            className="btn-verification approve"
            disabled={voter.isVerified}
            onClick={() => this.verifyVoter(true, voter.address)}
          >
            Approve
          </button>
          {/* optional reject button */}
          <button
            className="btn-verification reject"
            style={{ marginLeft: "10px" }}
            onClick={() => this.verifyVoter(false, voter.address)}
          >
            Reject
          </button>
        </div>
      </div>
    );

    return (
      <React.Fragment key={voter.address}>
        {verifiedBlock}
        {unverifiedBlock}
      </React.Fragment>
    );
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
          <AdminOnly page="Verification Page." />
        </>
      );
    }

    return (
      <>
        <NavbarAdmin />

        <div className="container-main">
          <h3>Verification</h3>
          <small>Total Voters: {this.state.voters.length}</small>

          {/* ✅ Excel Upload */}
          <div className="container-item">
            <div style={{ width: "100%" }}>
              <h4>Upload Voters by Excel (.xlsx)</h4>
              <p style={{ marginTop: 0 }}>
                Required columns:{" "}
                <code>address, name, phone, email, age, gender, region</code>
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

          {this.state.voters.length < 1 ? (
            <div className="container-item info">None has registered yet.</div>
          ) : (
            <>
              <div className="container-item info">
                <center>List of registered voters</center>
              </div>
              {this.state.voters.map(this.renderVoterCard)}
            </>
          )}
        </div>
      </>
    );
  }
}