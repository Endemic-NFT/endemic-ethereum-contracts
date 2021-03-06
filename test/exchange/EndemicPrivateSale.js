const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  deployEndemicExchangeWithDeps,
  deployEndemicCollectionWithFactory,
  deployEndemicToken,
} = require('../helpers/deploy');
const { getTypedMessage } = require('../helpers/eip712');
const {
  signTypedData,
  SignTypedDataVersion,
} = require('@metamask/eth-sig-util');
const { ZERO_ADDRESS } = require('../helpers/constants');

const INVALID_SIGNATURE = 'InvalidSignature';
const INVALID_VALUE_PROVIDED = 'InvalidValueProvided';
const INVALID_PAYMENT_METHOD = 'InvalidPaymentMethod';

const PRIVATE_SALE_EXPIRED = 'PrivateSaleExpired';
const PRIVATE_SALE_SUCCESS = 'PrivateSaleSuccess';

describe('EndemicPrivateSale', () => {
  let endemicExchange, endemicToken, nftContract;

  let owner, user2;

  const RANDOM_R_VALUE =
    '0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d';
  const RANDOM_S_VALUE =
    '0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562';
  const RANDOM_V_VALUE = '0x1c';
  const RANDOM_TIMESTAMP = 1678834236;
  const LAST_YEAR_TIMESTAMP = 1615762236;
  const ONE_ETHER = ethers.utils.parseUnits('1.0');
  const ZERO_ONE_ETHER = ethers.utils.parseUnits('0.1');

  async function mintERC721(recipient) {
    await nftContract
      .connect(owner)
      .mint(
        recipient,
        'bafybeigdyrzt5sfp7udm7hu76uh7y2anf3efuylqabf3oclgtqy55fbzdi'
      );
  }

  async function deploy() {
    [owner, user2] = await ethers.getSigners();

    const result = await deployEndemicExchangeWithDeps();

    endemicExchange = result.endemicExchangeContract;

    nftContract = (await deployEndemicCollectionWithFactory()).nftContract;

    await mintERC721(owner.address);
  }

  const getSignedPrivateSale = async (paymentErc20TokenAddress) => {
    const wallet = ethers.Wallet.createRandom();

    const signer = wallet.connect(endemicExchange.provider);

    await owner.sendTransaction({
      to: signer.address,
      value: ethers.utils.parseEther('1700'),
    });

    await mintERC721(signer.address);

    await nftContract.connect(signer).approve(endemicExchange.address, 2);

    const data = getTypedMessage({
      chainId: network.config.chainId,
      verifierContract: endemicExchange.address,
      nftContract: nftContract.address,
      seller: signer.address,
      buyer: owner.address,
      paymentErc20TokenAddress,
    });

    return signTypedData({
      privateKey: Buffer.from(signer.privateKey.substring(2), 'hex'),
      data,
      version: SignTypedDataVersion.V4,
    });
  };

  const getPrivateSaleSignature = async (
    paymentErc20TokenAddress = ZERO_ADDRESS
  ) => {
    const signedPrivateSale = await getSignedPrivateSale(
      paymentErc20TokenAddress
    );

    const signature = signedPrivateSale.substring(2);
    const r = '0x' + signature.substring(0, 64);
    const s = '0x' + signature.substring(64, 128);
    const v = parseInt(signature.substring(128, 130), 16);

    return { r, s, v };
  };

  describe('Initial State', function () {
    it('should set domain separator', async function () {
      await deploy();

      expect(await endemicExchange.DOMAIN_SEPARATOR()).to.exist;
    });
  });

  describe('Buy from private sale with Ether', function () {
    beforeEach(deploy);

    it('should fail with private sale expired', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          ZERO_ADDRESS,
          nftContract.address,
          1,
          ZERO_ONE_ETHER,
          LAST_YEAR_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE
        )
      ).to.be.revertedWith(PRIVATE_SALE_EXPIRED);
    });

    it('should fail with price not correct (too low provided)', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          ZERO_ADDRESS,
          nftContract.address,
          1,
          ONE_ETHER,
          RANDOM_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            value: ZERO_ONE_ETHER,
          }
        )
      ).to.be.revertedWith(INVALID_VALUE_PROVIDED);
    });

    it('should fail with invalid signature', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          ZERO_ADDRESS,
          nftContract.address,
          1,
          ONE_ETHER,
          RANDOM_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE,
          {
            value: ONE_ETHER,
          }
        )
      ).to.be.revertedWith(INVALID_SIGNATURE);
    });

    it('should succesfully buy from private sale', async function () {
      const { r, s, v } = await getPrivateSaleSignature();

      expect(
        await endemicExchange.buyFromPrivateSale(
          ZERO_ADDRESS,
          nftContract.address,
          2,
          1,
          1678968943,
          v,
          r,
          s,
          {
            value: 1,
          }
        )
      ).to.emit(endemicExchange, PRIVATE_SALE_SUCCESS);

      expect(await nftContract.ownerOf(2)).to.equal(owner.address);
    });

    it('should fail to buy with valid signature and invalid buyer', async function () {
      const { r, s, v } = await getPrivateSaleSignature();

      await expect(
        endemicExchange
          .connect(user2)
          .buyFromPrivateSale(
            ZERO_ADDRESS,
            nftContract.address,
            2,
            1,
            1678968943,
            v,
            r,
            s,
            {
              value: 1,
            }
          )
      ).to.be.revertedWith(INVALID_SIGNATURE);
    });
  });

  describe('Buy from private sale with ERC20', function () {
    beforeEach(async function () {
      await deploy();

      endemicToken = await deployEndemicToken(owner);

      await endemicExchange.updateSupportedErc20Tokens(
        endemicToken.address,
        true
      );
    });

    it('should fail with private sale expired', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          endemicToken.address,
          nftContract.address,
          1,
          ZERO_ONE_ETHER,
          LAST_YEAR_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE
        )
      ).to.be.revertedWith(PRIVATE_SALE_EXPIRED);
    });

    it('should fail with Erc20 not supported', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          '0x0000000000000000000000000000000000000001',
          nftContract.address,
          1,
          ONE_ETHER,
          RANDOM_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE
        )
      ).to.be.revertedWith(INVALID_PAYMENT_METHOD);
    });

    it('should fail with price not correct (too low approved)', async function () {
      await expect(
        endemicExchange.buyFromPrivateSale(
          endemicToken.address,
          nftContract.address,
          1,
          ONE_ETHER,
          RANDOM_TIMESTAMP,
          RANDOM_V_VALUE,
          RANDOM_R_VALUE,
          RANDOM_S_VALUE
        )
      ).to.be.revertedWith(INVALID_VALUE_PROVIDED);
    });

    it('should fail with invalid signature', async function () {
      await endemicToken.transfer(user2.address, ethers.utils.parseUnits('1'));

      await endemicToken
        .connect(user2)
        .approve(endemicExchange.address, ethers.utils.parseUnits('1'));

      await expect(
        endemicExchange
          .connect(user2)
          .buyFromPrivateSale(
            endemicToken.address,
            nftContract.address,
            1,
            ONE_ETHER,
            RANDOM_TIMESTAMP,
            RANDOM_V_VALUE,
            RANDOM_R_VALUE,
            RANDOM_S_VALUE
          )
      ).to.be.revertedWith(INVALID_SIGNATURE);
    });

    it('should succesfully buy from private sale', async function () {
      const { r, s, v } = await getPrivateSaleSignature(endemicToken.address);

      await endemicToken.approve(endemicExchange.address, 1);

      expect(
        await endemicExchange.buyFromPrivateSale(
          endemicToken.address,
          nftContract.address,
          2,
          1,
          1678968943,
          v,
          r,
          s
        )
      ).to.emit(endemicExchange, PRIVATE_SALE_SUCCESS);

      expect(await nftContract.ownerOf(2)).to.equal(owner.address);
    });

    it('should fail to buy with valid signature and invalid buyer', async function () {
      const { r, s, v } = await getPrivateSaleSignature(endemicToken.address);

      await endemicToken.transfer(user2.address, 1);
      await endemicToken.connect(user2).approve(endemicExchange.address, 1);

      await expect(
        endemicExchange
          .connect(user2)
          .buyFromPrivateSale(
            endemicToken.address,
            nftContract.address,
            2,
            1,
            1678968943,
            v,
            r,
            s
          )
      ).to.be.revertedWith(INVALID_SIGNATURE);
    });
  });
});
