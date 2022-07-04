const { ethers, network } = require('hardhat');
const { getVerifiedUsers } = require('./get-entities');
const { getForNetwork } = require('./addresses');
const { keccak256 } = require('../../test/helpers/eip712');

async function main() {
  const { endemicErc721Factory } = getForNetwork(network.name);

  const verifiedUsers = await getVerifiedUsers();

  const EndemicCollectionFactory = await ethers.getContractFactory(
    'EndemicCollectionFactory'
  );
  const endemicCollectionFactory = await EndemicCollectionFactory.attach(
    endemicErc721Factory
  );

  const MINTER_ROLE = keccak256('MINTER_ROLE');

  await Promise.all(
    verifiedUsers.forEach(async (verifiedUser) => {
      await endemicCollectionFactory.grantRole(
        MINTER_ROLE,
        verifiedUser.address
      );
    })
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
