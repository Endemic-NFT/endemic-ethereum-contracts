const axios = require('axios');

const queryGraph = async (query) => {
  const { data } = await axios({
    url: 'https://api.thegraph.com/subgraphs/name/endemic-nft/endemic-aurora',
    method: 'post',
    data: {
      query: query,
    },
  });

  return data.data;
};

const getAllAuctionIds = async () => {
  const { auctions } = await queryGraph(`
  query GetAllAuctions {
    auctions {
      id
    }
  }
`);

  return auctions.map((auction) => auction.id);
};

const getAllOfferIds = async () => {
  const { offers } = await queryGraph(`
  query GetAllOffers {
    offers {
      id
    }
  }
`);

  return offers.map((offer) => +offer.id);
};

const getCollectionsWithRoyalites = async () => {
  const { nftContracts } = await queryGraph(`
  query GetAllRoyalites {
    nftContracts(
      where: { royalties_not: null, royaltiesRecipient_not: null }
    ) {
      id
      royalties
      royaltiesRecipient
    }
  }
  `);

  return nftContracts;
};

const getVerifiedUsers = async () => {
  const { data } = await axios.get(
    'https://api.endemic.app/users/verified-users'
  );

  return data;
};

module.exports = {
  getAllAuctionIds,
  getAllOfferIds,
  getCollectionsWithRoyalites,
  getVerifiedUsers,
};
