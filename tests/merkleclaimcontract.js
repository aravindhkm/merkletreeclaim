const anchor = require("@project-serum/anchor");
const {
  createMint, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress 
} = require("@solana/spl-token");
const spl = require("@solana/spl-token");

const web3 = require("@solana/web3.js");
const { expect } = require("chai");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("merkleclaimcontract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Merkleclaimcontract;

  const contractAddress = String(program.programId);
  let claimContract;
  let tokenAddress;
  let userAccounts = [];
  let merkleData = [];
  let distributor;
  let userAssociateAccounts = [];
  let root;

  async function setProgram(account) {
    let wallet = new anchor.Wallet(account);
    let currentProvider = new anchor.AnchorProvider(
      provider.connection, wallet, provider.opts);

    claimContract = new anchor.Program(program.idl,program.programId,currentProvider);
  }

  it("Account Create & Airdrop", async () => {
    for(let i=0; i<5; i++) {
      userAccounts.push(anchor.web3.Keypair.generate());
      merkleData.push({ address: userAccounts[i].publicKey, amount: new anchor.BN(100e9) })

      await airDrop(userAccounts[0].publicKey, 100e9);
    }
    distributor = anchor.web3.Keypair.generate();
    await airDrop(distributor.publicKey, 100e9);
    tokenAddress = await createToken(userAccounts[0]);
    let associateWalletOne = await createAssociatedAccount(userAccounts[0],userAccounts[0].publicKey);
    await mint(userAccounts[0],associateWalletOne,new anchor.BN(100000e9));
    expect(await getTokenBalance(associateWalletOne)).equal("100000");

    let wallet = new anchor.Wallet(userAccounts[0]);
    let currentProvider = new anchor.AnchorProvider(provider.connection, wallet, provider.opts);
    claimContract = new anchor.Program(program.idl,program.programId,currentProvider);
  });


  it("InitializeConfig!", async () => {
    await setProgram(userAccounts[0]);

    const [pda,bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("config")],
      program.programId
    );

    // Add your test here.
    const tx = await claimContract.rpc.initializeConfig(
      bump, 
      {
        accounts: {
          owner: userAccounts[0].publicKey,
          config: pda,
          systemProgram: anchor.web3.SystemProgram.programId
        }
      }
    );
    console.log("Your transaction signature", tx);
  });

  function hashEncode(account,amount) {
    return keccak256(['address','uint256'], [account,amount])
  }

  it("Initialize!", async () => {
    await setProgram(userAccounts[0]);

    const leaves = Object.entries(merkleData).map((acc) => hashEncode(...acc));
  
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  
    // sent to client
    const rootHex = tree.getHexRoot();  
    root = Buffer.from(rootHex.slice(2), "hex");

    // root = new MerkleTree(Object.entries(merkleData).map(data => hashEncode(...data)), keccak256, { sortPairs: true });

    const [vaultAuthority,vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [distributor.publicKey.toBytes()],
      program.programId
    );

    const [configPda,configBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("config")],
      program.programId
    );

    let args = [
      {
        tokenPercentage: new anchor.BN(5000),
        startTs: new anchor.BN(Date.now() / 1000),
        intervalSec: new anchor.BN(1),
        times: new anchor.BN(1),
        airdropped: true,
      },
      {
        tokenPercentage: new anchor.BN(5000),
        startTs: new anchor.BN(Date.now() / 1000 + 1500),
        intervalSec: new anchor.BN(1),
        times: new anchor.BN(1),
        airdropped: true,
      }
    ]

    // // Add your test here.
  //   const tx = await claimContract.rpc.initialize(
  //     {
  //       vaultBump,
  //       root,
  //       args,
  //     },
  //     {
  //       accounts: {
  //         distributor: distributor.publicKey,
  //         adminOrOwner: userAccounts[0].publicKey,
  //         vaultAuthority: vaultAuthority,
  //         vault: userAccounts[1].publicKey,
  //         config: configPda,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //       },
  //       signers: [userAccounts[1], distributor]
  //     }
  //   );
  //  console.log("Your transaction signature", tx);
  // ecd690b20f0b73495dcac0c45b4beba5e84852c3a04aa945dc5ec312f787604f


  });






  async function transfer(fromWallet,fromTokenAccount,toTokenAccount) {
    let signature = await spl.transfer(
        provider.connection,
        fromWallet,
        fromTokenAccount,
        toTokenAccount,
        fromWallet.publicKey,
        10000e9
    );
  }

  async function mint(userWallet,userAssociateWallet,supply) {
    let signature = await mintTo(
      provider.connection,
      userWallet,
      tokenAddress,             
      userAssociateWallet,
      userWallet.publicKey,
      new anchor.BN(supply)
  );
  }

  async function createToken(wallet) {
    const mint = await createMint(
      provider.connection,
      wallet,
      wallet.publicKey,
      wallet.publicKey,
      9
    );
    return mint;
  }

  async function createAssociatedAccount(wallet,publicKey) {
      let tokenAssociateWallet = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet,
        tokenAddress,
        publicKey
      );
      return tokenAssociateWallet.address;
  }

  async function getAccountOwner(account,context) {
    let accountInfo = await provider.connection.getAccountInfo(account);
    console.log(context, "Account Info",{
        wallet : account.toString(),
        owner : accountInfo.owner.toString()
    }) 
  }

  async function getTokenBalance(account) {
    let currBal = await provider.connection.getTokenAccountBalance(account);
    return (currBal.value.uiAmountString);
  }

  async function getBalance(account) {
    return (await provider.connection.getBalance(account));
  } 

  async function airDrop(account,amount) {
    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(account,amount),
        "confirmed"
    );
  } 


});
