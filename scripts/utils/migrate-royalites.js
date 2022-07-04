const { ethers, network } = require('hardhat');
const { getCollectionsWithRoyalites } = require('./get-entities');
const { getForNetwork } = require('../utils/addresses');

async function main() {
  const { endemicExchangeProxy } = getForNetwork(network.name);

  const collections = await getCollectionsWithRoyalites();

  const RoyaltiesProvider = await ethers.getContractFactory(
    'RoyaltiesProvider'
  );
  const royaltiesProvider = await RoyaltiesProvider.attach(
    endemicExchangeProxy
  );

  await Promise.all(
    collections.forEach(async (collection) => {
      await royaltiesProvider.setRoyaltiesForCollection(
        collection.id,
        collection.royaltiesRecipient,
        collection.royalties
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
