// Node modules
import React, { Component } from "react";

// Components
import Navbar from "../Navbar/Navigation";
import NavbarAdmin from "../Navbar/NavigationAdmin";
import NotInit from "../NotInit";

// Contract
import getWeb3 from "../../getWeb3";
import Election from "../../contracts/Election.json";

// Excel reader
import * as XLSX from "xlsx";

// CSS
import "./Registration.css";

export default class Registration extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      web3: null,
      account: null,
      isAdmin: false,
      isElStarted: false,
      isElEnded: false,

      voterCount: 0,
      voters: [],

      // form fields
      voterName: "",
      voterPhone: "",
      voterEmail: "",
      voterAge: "",
      voterGender: "",
      voterRegion: "",

      currentVoter: {
        address: undefined,
        name: "",
        phone: "",
        email: "",
        age: 0,
        gender: "",
        region: "",
        hasVoted: false,
        isVerified: false,
        isRegistered: false,
      },

      // Excel upload status (admin)
      uploading: false,
      uploadMsg: "",
    };
  }

  componentDidMount = async () => {
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

      // ✅ Admin check (NEW ABI)
      const admin = await instance.methods.admin().call();
      const isAdmin = accounts[0].toLowerCase() === admin.toLowerCase();
      this.setState({ isAdmin });

      // ✅ Get start/end (NEW ABI)
      const start = await instance.methods.start().call();
      const end = await instance.methods.end().call();
      this.setState({ isElStarted: start, isElEnded: end });

      // ✅ Total voters (NEW ABI)
      const voterCount = await instance.methods.voterCount().call();
      this.setState({ voterCount: Number(voterCount) });

      // ✅ Load current voter
      const cv = await instance.methods.voterDetails(accounts[0]).call();
      const currentVoter = {
        address: cv.voterAddress,
        name: cv.name,
        phone: cv.phone,
        email: cv.email,
        age: Number(cv.age),
        gender: cv.gender,
        region: cv.region,
        hasVoted: cv.hasVoted,
        isVerified: cv.isVerified,
        isRegistered: cv.isRegistered,
      };
      this.setState({ currentVoter });

      // Prefill inputs if already registered
      if (currentVoter.isRegistered) {
        this.setState({
          voterName: currentVoter.name || "",
          voterPhone: currentVoter.phone || "",
          voterEmail: currentVoter.email || "",
          voterAge: currentVoter.age ? String(currentVoter.age) : "",
          voterGender: currentVoter.gender || "",
          voterRegion: currentVoter.region || "",
        });
      }

      // ✅ Load all voters (admin view only)
      if (isAdmin) {
        const voters = [];
        for (let i = 0; i < Number(voterCount); i++) {
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
      }
    } catch (error) {
      console.error(error);
      alert("Failed to load web3, accounts, or contract. Check console (F12).");
    }
  };

  handleChange = (key) => (e) => this.setState({ [key]: e.target.value });

  registerAsVoter = async (e) => {
    e.preventDefault();
    try {
      const ageNum = Number(this.state.voterAge);

      if (!Number.isFinite(ageNum) || ageNum <= 0) {
        alert("Please enter valid age.");
        return;
      }

      await this.state.ElectionInstance.methods
        .registerAsVoter(
          this.state.voterName.trim(),
          this.state.voterPhone.trim(),
          this.state.voterEmail.trim(),
          ageNum,
          this.state.voterGender.trim(),
          this.state.voterRegion.trim()
        )
        .send({ from: this.state.account, gas: 1500000 });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Registration failed");
    }
  };

  /* ---------------- Excel Upload (Admin) ----------------
     Required columns:
     address, name, phone, email, age, gender, region
     Example:
     0xabc..., Ram, 98..., ram@gmail.com, 21, Male, Kathmandu
  */

  onExcelSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      this.setState({ uploading: true, uploadMsg: "Reading Excel..." });

      const rows = await this.readExcel(file);

      if (!rows.length) {
        this.setState({ uploading: false, uploadMsg: "No rows found." });
        return;
      }

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

      await this.uploadVotersInChunks(cleaned);

      this.setState({ uploading: false, uploadMsg: "✅ Upload complete!" });
      window.location.reload();
    } catch (err) {
      console.error(err);
      this.setState({ uploading: false, uploadMsg: "❌ Upload failed (check console)." });
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

  uploadVotersInChunks = async (rows) => {
    const { ElectionInstance, account } = this.state;

    const CHUNK = 20; // safe for Ganache

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

  render() {
    if (!this.state.web3) {
      return (
        <>
          {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}
          <center>Loading Web3, accounts, and contract...</center>
        </>
      );
    }

    return (
      <>
        {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}

        {!this.state.isElStarted && !this.state.isElEnded ? (
          <NotInit />
        ) : (
          <>
            <div className="container-item info">
              <p>Total registered voters: {this.state.voterCount}</p>
            </div>

            {/* ✅ Admin Excel Upload */}
            {this.state.isAdmin ? (
              <div className="container-main">
                <h3>Upload Voters by Excel (.xlsx)</h3>
                <div className="container-item">
                  <div style={{ width: "100%" }}>
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
              </div>
            ) : null}

            {/* ✅ Voter self registration */}
            <div className="container-main">
              <h3>Registration</h3>
              <small>Register to vote.</small>

              <div className="container-item">
                <form onSubmit={this.registerAsVoter}>
                  <div className="div-li">
                    <label className={"label-r"}>
                      Account Address
                      <input
                        className={"input-r"}
                        type="text"
                        value={this.state.account}
                        readOnly
                        style={{ width: "420px" }}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Name
                      <input
                        className={"input-r"}
                        type="text"
                        placeholder="e.g. Roshan"
                        value={this.state.voterName}
                        onChange={this.handleChange("voterName")}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Phone
                      <input
                        className={"input-r"}
                        type="text"
                        placeholder="e.g. 9800000000"
                        value={this.state.voterPhone}
                        onChange={this.handleChange("voterPhone")}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Email
                      <input
                        className={"input-r"}
                        type="email"
                        placeholder="e.g. you@gmail.com"
                        value={this.state.voterEmail}
                        onChange={this.handleChange("voterEmail")}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Age
                      <input
                        className={"input-r"}
                        type="number"
                        placeholder="e.g. 21"
                        value={this.state.voterAge}
                        onChange={this.handleChange("voterAge")}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Gender
                      <input
                        className={"input-r"}
                        type="text"
                        placeholder="Male/Female/Other"
                        value={this.state.voterGender}
                        onChange={this.handleChange("voterGender")}
                      />
                    </label>
                  </div>

                  <div className="div-li">
                    <label className={"label-r"}>
                      Region
                      <input
                        className={"input-r"}
                        type="text"
                        placeholder="e.g. Kathmandu"
                        value={this.state.voterRegion}
                        onChange={this.handleChange("voterRegion")}
                      />
                    </label>
                  </div>

                  <p className="note">
                    <span style={{ color: "#000000" }}> Note: </span>
                    <br />
                    Make sure your details are correct.
                    <br />
                    Admin may verify only valid voters.
                  </p>

                  <button
                    className="btn-add"
                    type="submit"
                    disabled={
                      this.state.currentVoter.isVerified ||
                      this.state.voterName.trim().length < 2 ||
                      this.state.voterPhone.trim().length < 6 ||
                      this.state.voterEmail.trim().length < 6 ||
                      Number(this.state.voterAge) <= 0 ||
                      this.state.voterGender.trim().length < 2 ||
                      this.state.voterRegion.trim().length < 2
                    }
                  >
                    {this.state.currentVoter.isRegistered ? "Update" : "Register"}
                  </button>

                  {this.state.currentVoter.isVerified ? (
                    <p style={{ marginTop: "10px", color: "tomato" }}>
                      You are verified. Editing is disabled.
                    </p>
                  ) : null}
                </form>
              </div>
            </div>

            {/* ✅ Current voter info */}
            <div className="container-main" style={{ borderTop: "1px solid" }}>
              {loadCurrentVoter(this.state.currentVoter)}
            </div>

            {/* ✅ Admin: list all voters */}
            {this.state.isAdmin ? (
              <div className="container-main" style={{ borderTop: "1px solid" }}>
                <small>Total Voters: {this.state.voters.length}</small>
                {loadAllVoters(this.state.voters)}
              </div>
            ) : null}
          </>
        )}
      </>
    );
  }
}

export function loadCurrentVoter(voter) {
  return (
    <>
      <div className={"container-item " + (voter.isRegistered ? "success" : "attention")}>
        <center>Your Registered Info</center>
      </div>

      <div className={"container-list " + (voter.isRegistered ? "success" : "attention")}>
        <table>
          <tbody>
            <tr>
              <th>Account Address</th>
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
              <th>Verification</th>
              <td>{voter.isVerified ? "True" : "False"}</td>
            </tr>
            <tr>
              <th>Registered</th>
              <td>{voter.isRegistered ? "True" : "False"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export function loadAllVoters(voters) {
  return (
    <>
      <div className="container-item success">
        <center>List of voters</center>
      </div>

      {voters.map((voter) => (
        <div className="container-list success" key={voter.address}>
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
        </div>
      ))}
    </>
  );
}