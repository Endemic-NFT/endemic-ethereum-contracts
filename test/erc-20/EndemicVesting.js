const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { deployEndemicVesting } = require('../helpers/deploy');
const { BigNumber } = ethers;

const VESTING_NOT_STARTED = 'VestingNotStarted';
const NO_ALLOCATED_TOKENS = 'NoAllocatedTokensForClaimer';
const ALLOCATION_EXISTS = 'AllocationExists';
const END_TOKEN_CLAIMED = 'ENDTokenClaimed';

describe('EndemicVesting', function () {
  let owner, user1;

  let endemicVesting, endemicToken;

  const FIVE_MINUTES = 5 * 60;
  const ONE_YEAR = 12 * 30 * 24 * 60 * 60;

  const TGE_START_TIMESTAMP = Math.floor(new Date().getTime() / 1000);
  const VESTING_START_TIMESTAMP = TGE_START_TIMESTAMP + FIVE_MINUTES;

  const END_CLIFF_TIMESTAMP = TGE_START_TIMESTAMP + FIVE_MINUTES;
  const END_VESTING_TIMESTAMP = VESTING_START_TIMESTAMP + ONE_YEAR;

  const generateAllocRequests = async (
    endCliff,
    endVesting,
    initialAllocation = 500,
    totalAllocated = 1000
  ) => {
    return [...new Array(6)].map((_, i) => ({
      endCliff,
      endVesting,
      initialAllocation,
      totalAllocated,
      allocType: i,
      claimer: i < 3 ? owner.address : user1.address,
    }));
  };

  const assignToObject = (source) => Object.assign({}, source);

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();

    const result = await deployEndemicVesting(
      owner,
      TGE_START_TIMESTAMP,
      VESTING_START_TIMESTAMP
    );

    endemicVesting = result.endemicVesting;
    endemicToken = result.endemicToken;

    await endemicToken.approve(endemicVesting.address, 10000000);
  });

  describe('Initial state', () => {
    it('should fail with vesting not available before TGE', async () => {
      await expect(
        deployEndemicVesting(
          owner,
          VESTING_START_TIMESTAMP,
          TGE_START_TIMESTAMP
        )
      ).to.be.reverted;
    });

    it('should successfully deploy contract', async () => {
      await deployEndemicVesting(
        owner,
        TGE_START_TIMESTAMP,
        VESTING_START_TIMESTAMP
      );
    });
  });

  describe('Allocate additional tokens', function () {
    it('should successfully allocate tokens', async () => {
      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_VESTING_TIMESTAMP
      );

      await endemicVesting.addAllocations(allocRequests);
    });

    it('should fail to update existing allocation', async () => {
      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_VESTING_TIMESTAMP
      );

      await endemicVesting.addAllocations(allocRequests);

      await expect(
        endemicVesting.addAllocations(allocRequests)
      ).to.be.revertedWith(ALLOCATION_EXISTS);
    });
  });

  describe('Claim tokens', function () {
    beforeEach(async () => {
      await network.provider.send('evm_increaseTime', [FIVE_MINUTES]);
      await network.provider.send('evm_mine');
    });

    it('should fail with vesting not started yet', async () => {
      const START_TIME_IN_FUTURE = 1680209518;

      const { endemicVesting } = await deployEndemicVesting(
        owner,
        TGE_START_TIMESTAMP,
        START_TIME_IN_FUTURE
      );

      await expect(endemicVesting.claim(0)).to.be.revertedWith(
        VESTING_NOT_STARTED
      );

      await expect(
        endemicVesting.claimFor(owner.address, 0)
      ).to.be.revertedWith(VESTING_NOT_STARTED);
    });

    it('should fail with no allocated tokens for claimer', async () => {
      await expect(endemicVesting.claim(0)).to.be.revertedWith(
        NO_ALLOCATED_TOKENS
      );

      await expect(
        endemicVesting.claimFor(owner.address, 0)
      ).to.be.revertedWith(NO_ALLOCATED_TOKENS);
    });

    it('should fail to claim initial tokens when neither cliff or vesting passed', async () => {
      await endemicVesting.addAllocations([
        {
          endCliff: END_VESTING_TIMESTAMP,
          endVesting: END_VESTING_TIMESTAMP,
          initialAllocation: 0,
          totalAllocated: 5000,
          allocType: 5,
          claimer: user1.address,
        },
      ]);

      await expect(endemicVesting.connect(user1).claim(5)).to.be.revertedWith(
        NO_ALLOCATED_TOKENS
      );
    });

    it('should claim tokens for address when cliff passed and vesting not finished yet', async () => {
      const initialAllocation = 500;
      const totalAllocated = 1000;

      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_VESTING_TIMESTAMP,
        initialAllocation,
        totalAllocated
      );

      await endemicVesting.addAllocations(allocRequests);

      const initalLinearClaim = 526;
      const closeToDelta = totalAllocated - initalLinearClaim;

      //verify claimer allocations before claim
      const ownerAllocsBeforeClaim =
        await endemicVesting.getAllocationsForClaimer(owner.address);

      const userAllocsBeforeClaim =
        await endemicVesting.getAllocationsForClaimer(user1.address);

      const ownerSeedAllocBeforeClaim = assignToObject(
        ownerAllocsBeforeClaim[0][0]
      );
      const userTeamAllocBeforeClaim = assignToObject(
        userAllocsBeforeClaim[0][5]
      );

      const ownerAmountToClaimForSeedBefore = ownerAllocsBeforeClaim[1][0];
      const userAmountToClaimForTeamBefore = userAllocsBeforeClaim[1][5];

      expect(ownerSeedAllocBeforeClaim.totalAllocated).to.equal(1000);
      expect(ownerSeedAllocBeforeClaim.totalClaimed).to.equal(0);

      expect(userTeamAllocBeforeClaim.totalAllocated).to.equal(1000);
      expect(userTeamAllocBeforeClaim.totalClaimed).to.equal(0);
      expect(ownerAmountToClaimForSeedBefore).to.be.closeTo(
        BigNumber.from(initalLinearClaim),
        closeToDelta
      ); //initial + linear
      expect(userAmountToClaimForTeamBefore).to.be.closeTo(
        BigNumber.from(initalLinearClaim),
        closeToDelta
      ); //initial + linear

      //claim tokens for owner and user
      await expect(endemicVesting.claimFor(owner.address, 0)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );
      await expect(endemicVesting.claimFor(user1.address, 5)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );

      //verify claimer allocations after claim
      const ownerAllocationsAfterClaim =
        await endemicVesting.getAllocationsForClaimer(owner.address);

      const userAllocationsAfterClaim =
        await endemicVesting.getAllocationsForClaimer(user1.address);

      const ownerSeedAlocationAfterClaim = assignToObject(
        ownerAllocationsAfterClaim[0][0]
      );
      const userTeamAlocationAfterClaim = assignToObject(
        userAllocationsAfterClaim[0][5]
      );

      const ownerAmountToClaimForSeedAfter = ownerAllocationsAfterClaim[1][0];
      const userAmountToClaimForTeamAfter = userAllocationsAfterClaim[1][5];

      expect(ownerSeedAlocationAfterClaim.totalAllocated).to.equal(1000);
      expect(ownerSeedAlocationAfterClaim.totalClaimed).to.be.closeTo(
        BigNumber.from(initalLinearClaim),
        closeToDelta
      ); //initial + linear

      expect(userTeamAlocationAfterClaim.totalAllocated).to.equal(1000);
      expect(userTeamAlocationAfterClaim.totalClaimed).to.be.closeTo(
        BigNumber.from(initalLinearClaim),
        closeToDelta
      ); //initial + linear

      expect(ownerAmountToClaimForSeedAfter).to.equal(0);
      expect(userAmountToClaimForTeamAfter).to.equal(0);
    });

    it('should claim tokens when cliff passed and vesting not finished yet', async () => {
      const initialAllocation = 500;
      const totalAllocated = 1000;

      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_VESTING_TIMESTAMP,
        initialAllocation,
        totalAllocated
      );

      await endemicVesting.addAllocations(allocRequests);

      const initalLinearClaim = 526;
      const closeToDelta = totalAllocated - initalLinearClaim;

      await expect(endemicVesting.connect(user1).claim(5)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );

      expect(await endemicToken.balanceOf(user1.address)).to.be.closeTo(
        BigNumber.from(initalLinearClaim),
        closeToDelta
      ); //initial + linear
    });

    it('should claim tokens for address when cliff and vesting passed', async () => {
      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_CLIFF_TIMESTAMP
      );

      await endemicVesting.addAllocations(allocRequests);

      //verify claimer allocations before claim
      const ownerAllocsBeforeClaim =
        await endemicVesting.getAllocationsForClaimer(owner.address);

      const userAllocsBeforeClaim =
        await endemicVesting.getAllocationsForClaimer(user1.address);

      const ownerSeedAllocBeforeClaim = assignToObject(
        ownerAllocsBeforeClaim[0][0]
      );
      const userTeamAllocBeforeClaim = assignToObject(
        userAllocsBeforeClaim[0][5]
      );

      const ownerAmountToClaimForSeedBefore = ownerAllocsBeforeClaim[1][0];
      const userAmountToClaimForTeamBefore = userAllocsBeforeClaim[1][5];

      expect(ownerSeedAllocBeforeClaim.totalAllocated).to.equal(1000);
      expect(ownerSeedAllocBeforeClaim.totalClaimed).to.equal(0);

      expect(userTeamAllocBeforeClaim.totalAllocated).to.equal(1000);
      expect(userTeamAllocBeforeClaim.totalClaimed).to.equal(0);

      expect(ownerAmountToClaimForSeedBefore).to.equal('1000'); //amount of total allocated
      expect(userAmountToClaimForTeamBefore).to.equal('1000'); //amount of total allocated

      //claim tokens for user and owner
      await expect(endemicVesting.claimFor(owner.address, 0)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );
      await expect(endemicVesting.claimFor(user1.address, 5)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );

      //verify claimer allocations after claim
      const ownerAllocationsAfterClaim =
        await endemicVesting.getAllocationsForClaimer(owner.address);

      const userAllocationsAfterClaim =
        await endemicVesting.getAllocationsForClaimer(user1.address);

      const ownerSeedAlocationAfterClaim = assignToObject(
        ownerAllocationsAfterClaim[0][0]
      );
      const userTeamAlocationAfterClaim = assignToObject(
        userAllocationsAfterClaim[0][5]
      );

      const ownerAmountToClaimForSeedAfter = ownerAllocationsAfterClaim[1][0];
      const userAmountToClaimForTeamAfter = userAllocationsAfterClaim[1][5];

      expect(ownerSeedAlocationAfterClaim.totalAllocated).to.equal(1000);
      expect(ownerSeedAlocationAfterClaim.totalClaimed).to.equal(1000); //amount of total allocated

      expect(userTeamAlocationAfterClaim.totalAllocated).to.equal(1000);
      expect(userTeamAlocationAfterClaim.totalClaimed).to.equal(1000); //amount of total allocated

      expect(ownerAmountToClaimForSeedAfter).to.equal(0);
      expect(userAmountToClaimForTeamAfter).to.equal(0);
    });

    it('should claim tokens when cliff and vesting passed', async () => {
      const allocRequests = await generateAllocRequests(
        END_CLIFF_TIMESTAMP,
        END_CLIFF_TIMESTAMP
      );

      await endemicVesting.addAllocations(allocRequests);

      await expect(endemicVesting.connect(user1).claim(5)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );

      expect(await endemicToken.balanceOf(user1.address)).to.equal('1000'); //amount of total allocated
    });

    it('should claim initial tokens for address when neither cliff or vesting passed', async () => {
      const allocRequests = await generateAllocRequests(
        END_VESTING_TIMESTAMP,
        END_VESTING_TIMESTAMP
      );

      await endemicVesting.addAllocations(allocRequests);

      await expect(endemicVesting.claimFor(user1.address, 5)).to.emit(
        endemicVesting,
        END_TOKEN_CLAIMED
      );

      expect(await endemicToken.balanceOf(user1.address)).to.equal('500'); //initial allocated
    });
  });
});
