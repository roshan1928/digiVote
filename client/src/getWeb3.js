import Web3 from "web3";

const getWeb3 = async () => {
  // Modern DApp browsers
  if (window.ethereum) {
    try {
      // Create a new Web3 instance using the injected provider
      const web3 = new Web3(window.ethereum);
      
      // Request account access (modern way)
      await window.ethereum.request({ method: "eth_requestAccounts" });
      
      console.log("✅ Connected to MetaMask successfully");
      return web3;
    } catch (error) {
      console.error("❌ User denied MetaMask connection:", error);
      throw error;
    }
  }

  // Legacy DApp browsers
  else if (window.web3) {
    const web3 = new Web3(window.web3.currentProvider);
    console.warn("⚠️ Using legacy web3 provider. Consider updating MetaMask.");
    return web3;
  }

  // Localhost fallback (e.g., Ganache)
  else {
    const provider = new Web3.providers.HttpProvider("http://127.0.0.1:7545");
    const web3 = new Web3(provider);
    console.warn("⚙️ No Ethereum provider detected, using Ganache local node.");
    return web3;
  }
};

export default getWeb3;
