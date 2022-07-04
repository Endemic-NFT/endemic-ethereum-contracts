const { ethers, network } = require('hardhat');
const { getAllOfferIds } = require('./get-entities');
const { getForNetwork } = require('../utils/addresses');

async function main() {
  const { endemicExchangeProxy } = getForNetwork(network.name);

  const offerIdsToCancel = await getAllOfferIds();

  const EndemicExchange = await ethers.getContractFactory('EndemicExchange');
  const endemicExchange = await EndemicExchange.attach(endemicExchangeProxy);

  console.log('Canceling offers');

  await endemicExchange.adminCancelOffers(offerIdsToCancel);

  console.log('Offers canceled');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
