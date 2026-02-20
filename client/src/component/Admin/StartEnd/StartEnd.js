import React, { Component } from "react";

import Navbar from "../../Navbar/Navigation";
import NavbarAdmin from "../../Navbar/NavigationAdmin";

import AdminOnly from "../../AdminOnly";

import getWeb3 from "../../../getWeb3";
import Election from "../../../contracts/Election.json";

import "./StartEnd.css";

export default class StartEnd extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      web3: null,
      account: null,
      isAdmin: false,
      elStarted: false,
      elEnded: false,
    };
  }

  componentDidMount = async () => {
    // refreshing page only once
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
        web3: web3,
        ElectionInstance: instance,
        account: accounts[0],
      });

      // ✅ Admin info (NEW ABI)
      const admin = await instance.methods.admin().call();
      if (accounts[0].toLowerCase() === admin.toLowerCase()) {
        this.setState({ isAdmin: true });
      }

      // ✅ Get election status (NEW ABI)
      const start = await instance.methods.start().call();
      const end = await instance.methods.end().call();

      this.setState({
        elStarted: start,
        elEnded: end,
      });
    } catch (error) {
      alert("Failed to load web3, accounts, or contract. Check console.");
      console.error(error);
    }
  };

  startElection = async () => {
    try {
      await this.state.ElectionInstance.methods
        .startElection()
        .send({ from: this.state.account, gas: 1000000 });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error starting election");
    }
  };

  endElection = async () => {
    try {
      await this.state.ElectionInstance.methods
        .endElection()
        .send({ from: this.state.account, gas: 1000000 });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error ending election");
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
          <AdminOnly page="Start and end election page." />
        </>
      );
    }

    return (
      <>
        <NavbarAdmin />

        {!this.state.elStarted && !this.state.elEnded ? (
          <div className="container-item info">
            <center>The election has not been started yet.</center>
          </div>
        ) : null}

        <div className="container-main">
          <h3>Start or end election</h3>

          {!this.state.elStarted ? (
            <>
              <div className="container-item">
                <button onClick={this.startElection} className="start-btn">
                  Start {this.state.elEnded ? "Again" : ""}
                </button>
              </div>

              {this.state.elEnded ? (
                <div className="container-item">
                  <center>
                    <p>The election ended.</p>
                  </center>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="container-item">
                <center>
                  <p>The election started.</p>
                </center>
              </div>

              <div className="container-item">
                <button onClick={this.endElection} className="start-btn">
                  End
                </button>
              </div>
            </>
          )}

          <div className="election-status">
            <p>Started: {this.state.elStarted ? "True" : "False"}</p>
            <p>Ended: {this.state.elEnded ? "True" : "False"}</p>
          </div>
        </div>
      </>
    );
  }
}