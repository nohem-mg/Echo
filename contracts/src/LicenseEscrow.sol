// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Echo LicenseEscrow — private OTC sale of song rights, settled through Unlink.
/// @notice Buyers and sellers interact with this escrow via Unlink `execute()`, so each
///         party's `msg.sender` is their own per-user ExecutionAccount: a stable, unique
///         address that is UNLINKABLE to their real wallet. That is the privacy property —
///         the contract can tell buyer from seller, but nobody on-chain can tell *who* they
///         are. Value moves as the Unlink ERC-20 token (funded from the private balance),
///         not native ETH, so `purchase` pulls via `transferFrom` instead of `msg.value`.
///         A buyer batches `[approve, purchase]` atomically in one `execute()` call.
contract LicenseEscrow {

    struct Listing {
        bytes32 trackId;      // reference to the Registry track being licensed
        address seller;       // seller's Unlink ExecutionAccount (pseudonymous)
        uint256 price;        // in Unlink token units
        uint8   licenseType;  // 0=Sync 1=Beat 2=Full
        uint8   duration;     // 0=1yr  1=Perpetual
        bool    active;       // false once sold or cancelled
        bool    sold;
        uint256 createdAt;
    }

    struct Purchase {
        address buyer;        // buyer's Unlink ExecutionAccount (pseudonymous)
        uint256 amount;       // Unlink token amount held in escrow
        bool    confirmed;    // true after confirmAndRelease()
        uint256 purchasedAt;
    }

    IRegistry public immutable registry;
    IERC20    public immutable token;    // the Unlink ERC-20 (ULNKMock on Sepolia)

    mapping(bytes32 => Listing)  public listings;
    mapping(bytes32 => Purchase) public purchases;
    bytes32[] private listingIds;

    event ListingCreated(bytes32 indexed listingId, bytes32 indexed trackId, address indexed seller, uint256 price, uint8 licenseType);
    event LicensePurchased(bytes32 indexed listingId, address indexed buyer, uint256 amount);
    event LicenseConfirmed(bytes32 indexed listingId);
    event ListingCancelled(bytes32 indexed listingId);

    error TrackNotSealed();
    error InvalidParams();
    error NotAvailable();
    error NotSeller();
    error NotBuyer();
    error AlreadyConfirmed();
    error AlreadySold();
    error PaymentFailed();

    constructor(address _registry, address _token) {
        registry = IRegistry(_registry);
        token = IERC20(_token);
    }

    /// @notice Seller lists a track for sale. Reverts unless the track is SEALED in the Registry.
    function createListing(
        bytes32 trackId,
        uint256 price,
        uint8   licenseType,
        uint8   duration
    ) external returns (bytes32 listingId) {
        IRegistry.Entry memory e = registry.getEntry(trackId);
        if (e.timestamp == 0 || e.status != IRegistry.Status.SEALED) revert TrackNotSealed();
        if (price == 0 || licenseType > 2 || duration > 1) revert InvalidParams();

        listingId = keccak256(abi.encode(msg.sender, trackId, block.timestamp, listingIds.length));
        listings[listingId] = Listing({
            trackId:     trackId,
            seller:      msg.sender,
            price:       price,
            licenseType: licenseType,
            duration:    duration,
            active:      true,
            sold:        false,
            createdAt:   block.timestamp
        });
        listingIds.push(listingId);
        emit ListingCreated(listingId, trackId, msg.sender, price, licenseType);
    }

    /// @notice Buyer escrows the exact price in Unlink tokens. NOT payable — the buyer must
    ///         have approved `price` to this contract first (batch `[approve, purchase]` in
    ///         one Unlink execute() call). Funds are held until the buyer confirms.
    function purchase(bytes32 listingId) external {
        Listing storage l = listings[listingId];
        if (!l.active || l.sold) revert NotAvailable();
        if (l.seller == msg.sender) revert InvalidParams();

        // checks-effects-interactions: mark sold before pulling funds.
        l.sold = true;
        l.active = false;
        purchases[listingId] = Purchase({
            buyer:       msg.sender,
            amount:      l.price,
            confirmed:   false,
            purchasedAt: block.timestamp
        });

        if (!token.transferFrom(msg.sender, address(this), l.price)) revert PaymentFailed();
        emit LicensePurchased(listingId, msg.sender, l.price);
    }

    /// @notice Buyer confirms receipt of the rights → releases escrowed funds to the seller.
    function confirmAndRelease(bytes32 listingId) external {
        Purchase storage p = purchases[listingId];
        if (p.buyer != msg.sender) revert NotBuyer();
        if (p.confirmed) revert AlreadyConfirmed();

        p.confirmed = true;
        if (!token.transfer(listings[listingId].seller, p.amount)) revert PaymentFailed();
        emit LicenseConfirmed(listingId);
    }

    /// @notice Seller cancels an unsold listing.
    function cancel(bytes32 listingId) external {
        Listing storage l = listings[listingId];
        if (l.seller != msg.sender) revert NotSeller();
        if (l.sold) revert AlreadySold();
        l.active = false;
        emit ListingCancelled(listingId);
    }

    function getListingIds() external view returns (bytes32[] memory) {
        return listingIds;
    }

    function getListing(bytes32 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getPurchase(bytes32 listingId) external view returns (Purchase memory) {
        return purchases[listingId];
    }
}

interface IRegistry {
    enum Status { SEALED, REVEALED }
    struct Entry {
        bytes32 commitmentHash;
        uint256 timestamp;
        Status  status;
        bytes32 registryRef;
        address owner;
    }
    function getEntry(bytes32 trackId) external view returns (Entry memory);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}
