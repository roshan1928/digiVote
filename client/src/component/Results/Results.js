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
import "./Results.css";

export default class Result extends Component {
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
        alert("Smart contract not deployed to this network.");
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

      if (accounts[0].toLowerCase() === admin.toLowerCase()) {
        this.setState({ isAdmin: true });
      }

      const candidates = [];

      for (let i = 0; i < Number(candidateCount); i++) {
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

      this.setState({
        candidateCount: Number(candidateCount),
        candidates,
        isElStarted: start,
        isElEnded: end,
      });
    } catch (error) {
      alert("Failed to load web3, accounts, or contract.");
      console.error(error);
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
        <br />

        {!this.state.isElStarted && !this.state.isElEnded ? (
          <NotInit />
        ) : this.state.isElStarted && !this.state.isElEnded ? (
          <div className="container-item attention">
            <center>
              <h3>The election is currently ongoing.</h3>
              <p>Results will be available after the election ends.</p>
              <Link to="/Voting" style={{ color: "black" }}>
                Go to Voting Page
              </Link>
            </center>
          </div>
        ) : !this.state.isElStarted && this.state.isElEnded ? (
          displayResults(this.state.candidates)
        ) : null}
      </>
    );
  }
}

/* -------------------- Winner Section -------------------- */

function displayWinner(candidates) {
  if (candidates.length === 0) return null;

  let maxVotes = Math.max(...candidates.map((c) => c.voteCount));
  const winners = candidates.filter((c) => c.voteCount === maxVotes);

  return (
    <>
      {winners.map((winner) => (
        <div className="container-winner" key={winner.id}>
          <div className="winner-info">
            <p className="winner-tag">Winner!</p>
            <h2>{winner.name}</h2>
            <p>{winner.party}</p>
            <p>
              {winner.gender}, {winner.age} | {winner.region}
            </p>
          </div>

          <div className="winner-votes">
            <div className="votes-tag">Total Votes:</div>
            <div className="vote-count">{winner.voteCount}</div>
          </div>
        </div>
      ))}
    </>
  );
}

/* -------------------- Results Table -------------------- */

export function displayResults(candidates) {
  const renderResults = (candidate) => (
    <tr key={candidate.id}>
      <td>{candidate.id}</td>
      <td>{candidate.name}</td>
      <td>{candidate.party}</td>
      <td>{candidate.region}</td>
      <td>{candidate.voteCount}</td>
    </tr>
  );

  return (
    <>
      {candidates.length > 0 && (
        <div className="container-main">{displayWinner(candidates)}</div>
      )}

      <div className="container-main" style={{ borderTop: "1px solid" }}>
        <h2>Results</h2>
        <small>Total candidates: {candidates.length}</small>

        {candidates.length < 1 ? (
          <div className="container-item attention">
            <center>No candidates.</center>
          </div>
        ) : (
          <>
            <div className="container-item">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Party</th>
                    <th>Region</th>
                    <th>Votes</th>
                  </tr>
                </thead>
                <tbody>{candidates.map(renderResults)}</tbody>
              </table>
            </div>

            <div className="container-item" style={{ border: "1px solid black" }}>
              <center>End of results</center>
            </div>
          </>
        )}
      </div>
    </>
  );
}