// Node modules
import React, { Component } from "react";
import { Link } from "react-router-dom";

// Components
import Navbar from "../Navbar/Navigation";
import NavbarAdmin from "../Navbar/NavigationAdmin";
import NotInit from "../NotInit";

// Contract
import getWeb3 from "../../getWeb3";
import Election from "../../contracts/Election.json";

// CSS
import "./Voting.css";

export default class Voting extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      account: null,
      web3: null,
      isAdmin: false,

      candidateCount: 0,
      candidates: [],

      isElStarted: false,
      isElEnded: false,

      currentVoter: {
        address: undefined,
        name: "",
        phone: "",
        hasVoted: false,
        isVerified: false,
        isRegistered: false,
      },
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

      this.setState({
        web3,
        ElectionInstance: instance,
        account: accounts[0],
      });

      // ✅ NEW ABI
      const candidateCount = await instance.methods.candidateCount().call();
      const start = await instance.methods.start().call();
      const end = await instance.methods.end().call();
      const admin = await instance.methods.admin().call();

      this.setState({
        candidateCount: Number(candidateCount),
        isElStarted: start,
        isElEnded: end,
        isAdmin: accounts[0].toLowerCase() === admin.toLowerCase(),
      });

      // ✅ Load candidates (new fields)
      const candidates = [];
      for (let i = 0; i < Number(candidateCount); i++) {
        const c = await instance.methods.candidateDetails(i).call();
        candidates.push({
          id: Number(c.candidateId),
          name: c.name,
          party: c.party,
          symbol: c.symbol, // e.g. "tree.png"
          age: Number(c.age),
          gender: c.gender,
          region: c.region,
        });
      }
      this.setState({ candidates });

      // ✅ Load current voter (same struct)
      const voter = await instance.methods.voterDetails(accounts[0]).call();
      this.setState({
        currentVoter: {
          address: voter.voterAddress,
          name: voter.name,
          phone: voter.phone,
          hasVoted: voter.hasVoted,
          isVerified: voter.isVerified,
          isRegistered: voter.isRegistered,
        },
      });
    } catch (error) {
      alert("Failed to load web3, accounts, or contract. Check console.");
      console.error(error);
    }
  };

  castVote = async (id) => {
    try {
      await this.state.ElectionInstance.methods
        .vote(id)
        .send({ from: this.state.account, gas: 1000000 });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Vote failed. Check console.");
    }
  };

  confirmVote = (id, name) => {
    const r = window.confirm(`Vote for ${name} (ID ${id})?\nAre you sure?`);
    if (r === true) {
      this.castVote(id);
    }
  };

  renderCandidates = (candidate) => {
    const disabled =
      !this.state.currentVoter.isRegistered ||
      !this.state.currentVoter.isVerified ||
      this.state.currentVoter.hasVoted;

    // Optional: show symbol image if you store PNG names like "tree.png"
    // Put your images in: client/src/assets/symbols/
    let symbolImg = null;
    try {
      symbolImg = candidate.symbol
        ? require(`../../assets/symbols/${candidate.symbol}`)
        : null;
    } catch (e) {
      symbolImg = null; // if image not found, just ignore
    }

    return (
      <div className="container-item" key={candidate.id}>
        <div className="candidate-info">
          <h2>
            {candidate.name} <small>#{candidate.id}</small>
          </h2>
          <p className="slogan">
            <strong>Party:</strong> {candidate.party} <br />
            <strong>Region:</strong> {candidate.region} <br />
            <strong>Gender/Age:</strong> {candidate.gender}, {candidate.age}
          </p>

          {symbolImg ? (
            <div style={{ marginTop: "8px" }}>
              <strong>Symbol: </strong>
              <img
                src={symbolImg}
                alt="symbol"
                style={{ width: "55px", height: "55px", objectFit: "contain" }}
              />
              <small style={{ marginLeft: "10px" }}>{candidate.symbol}</small>
            </div>
          ) : (
            <p style={{ marginTop: "8px" }}>
              <strong>Symbol:</strong> {candidate.symbol || "N/A"}
            </p>
          )}
        </div>

        <div className="vote-btn-container">
          <button
            onClick={() => this.confirmVote(candidate.id, candidate.name)}
            className="vote-bth"
            disabled={disabled}
          >
            Vote
          </button>
        </div>
      </div>
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

    return (
      <>
        {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}

        <div>
          {!this.state.isElStarted && !this.state.isElEnded ? (
            <NotInit />
          ) : this.state.isElStarted && !this.state.isElEnded ? (
            <>
              {/* Status box */}
              {this.state.currentVoter.isRegistered ? (
                this.state.currentVoter.isVerified ? (
                  this.state.currentVoter.hasVoted ? (
                    <div className="container-item success">
                      <div>
                        <strong>You have cast your vote.</strong>
                        <p />
                        <center>
                          <Link
                            to="/Results"
                            style={{ color: "black", textDecoration: "underline" }}
                          >
                            See Results
                          </Link>
                        </center>
                      </div>
                    </div>
                  ) : (
                    <div className="container-item info">
                      <center>Go ahead and cast your vote.</center>
                    </div>
                  )
                ) : (
                  <div className="container-item attention">
                    <center>Please wait for admin verification.</center>
                  </div>
                )
              ) : (
                <div className="container-item attention">
                  <center>
                    <p>You are not registered. Please register first.</p>
                    <br />
                    <Link
                      to="/Registration"
                      style={{ color: "black", textDecoration: "underline" }}
                    >
                      Registration Page
                    </Link>
                  </center>
                </div>
              )}

              {/* Candidate list */}
              <div className="container-main">
                <h2>Candidates</h2>
                <small>Total candidates: {this.state.candidates.length}</small>

                {this.state.candidates.length < 1 ? (
                  <div className="container-item attention">
                    <center>No candidates found.</center>
                  </div>
                ) : (
                  <>
                    {this.state.candidates.map(this.renderCandidates)}
                    <div className="container-item" style={{ border: "1px solid black" }}>
                      <center>That is all.</center>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : !this.state.isElStarted && this.state.isElEnded ? (
            <div className="container-item attention">
              <center>
                <h3>The Election ended.</h3>
                <br />
                <Link
                  to="/Results"
                  style={{ color: "black", textDecoration: "underline" }}
                >
                  See results
                </Link>
              </center>
            </div>
          ) : null}
        </div>
      </>
    );
  }
}