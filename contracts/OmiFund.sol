// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title OmiFund
/// @notice An open protocol for flood funds. Anyone can open a fund ("site") for a
/// stretch of river, register the households it protects, and anyone can fund it.
/// It pays those households in USDC when the river crosses a level fixed before the
/// season starts: part when the forecast says the flood is coming, the rest when
/// the river has stayed at or above the flood level for the agreed number of days.
///
/// Money leaves this contract in exactly one way: as a payout to the households of
/// the site it was given to, when that site's river meets its rule. There is no
/// withdraw function, for anyone. Unspent money stays with the site for its next season.
contract OmiFund {
    IERC20 public immutable usdc;
    /// Posts the daily river reading for each site (the shared data layer).
    address public immutable reporter;
    /// Can veto a reading while it waits, if the posted numbers don't match the source.
    address public immutable guardian;
    /// Seconds a reading waits before it can be settled.
    uint64 public immutable challengeWindow;

    uint256 public constant MAX_HOUSEHOLDS = 500;
    uint256 private constant BPS = 10_000;

    struct Site {
        string name;
        address manager; // whoever opened the site; sets households before each season
        int32 latE4; // river cell, degrees x 1e4
        int32 lonE4;
        uint32 floodLevel; // m3/s; full payout after `consecutiveDays` days at or above it
        uint32 warnLevel; // m3/s; shown to households, moves no money
        uint64 seasonStart; // unix seconds
        uint64 seasonEnd;
        uint128 coverPerHousehold; // USDC base units, paid over one season
        uint16 earlyBps; // share of the cover paid when the forecast reaches the flood level
        uint8 consecutiveDays;
        bool earlyPaid;
        bool fullPaid;
        uint128 paidPerHousehold; // this season
        uint256 balance; // USDC held for this site
        uint32 lastSettledDay; // unix day of the last settled reading
        uint32 lastPostedDay;
        uint32 streak; // consecutive settled days at or above the flood level
    }

    struct Reading {
        uint32 siteId;
        uint32 day; // unix day (UTC) the reading describes
        uint32 observed; // m3/s
        uint32 forecastMedianMax; // highest ensemble-median discharge in the lead window, m3/s
        bytes32 sourceHash; // keccak256 of the exact data the reporter used
        uint64 readyAt;
        bool vetoed;
        bool settled;
    }

    Site[] private _sites;
    mapping(uint256 => address[]) private _households;
    mapping(uint256 => mapping(address => bool)) public isHousehold;
    Reading[] private _readings;
    /// Readings settle strictly in the order they were posted.
    uint256 public nextToSettle;
    uint256 public totalPaid;

    event SiteAdded(uint256 indexed siteId, address indexed manager, string name, uint32 floodLevel, uint64 seasonStart, uint64 seasonEnd);
    event HouseholdAdded(uint256 indexed siteId, address indexed household);
    event HouseholdRemoved(uint256 indexed siteId, address indexed household);
    event SeasonRenewed(uint256 indexed siteId, uint64 seasonStart, uint64 seasonEnd);
    event Funded(uint256 indexed siteId, address indexed donor, uint256 amount);
    event ReadingPosted(
        uint256 indexed readingId,
        uint256 indexed siteId,
        uint32 day,
        uint32 observed,
        uint32 forecastMedianMax,
        bytes32 sourceHash,
        uint64 readyAt
    );
    event ReadingVetoed(uint256 indexed readingId);
    event ReadingSettled(uint256 indexed readingId, uint256 indexed siteId, uint32 streak);
    /// kind 0 = early (forecast), 1 = full (observed).
    event Payout(uint256 indexed siteId, uint8 kind, uint256 perHousehold, uint256 households, uint256 total);

    error NotManager();
    error NotReporter();
    error NotGuardian();
    error UnknownSite();
    error BadSettings();
    error SeasonUnderway();
    error SeasonNotOver();
    error OutOfSeason();
    error TooManyHouseholds();
    error BadHousehold();
    error DayNotAfterLast();
    error NotReady();
    error ReadingClosed();
    error OutOfOrder();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyManager(uint256 siteId) {
        if (msg.sender != _site(siteId).manager) revert NotManager();
        _;
    }

    constructor(IERC20 usdc_, address reporter_, address guardian_, uint64 challengeWindow_) {
        if (address(usdc_) == address(0) || reporter_ == address(0) || guardian_ == address(0)) revert BadSettings();
        usdc = usdc_;
        reporter = reporter_;
        guardian = guardian_;
        challengeWindow = challengeWindow_;
    }

    // ------------------------------------------------------------------ setup

    function addSite(
        string calldata name,
        int32 latE4,
        int32 lonE4,
        uint32 floodLevel,
        uint32 warnLevel,
        uint64 seasonStart,
        uint64 seasonEnd,
        uint128 coverPerHousehold,
        uint16 earlyBps,
        uint8 consecutiveDays
    ) external returns (uint256 siteId) {
        if (
            floodLevel == 0 || warnLevel > floodLevel || seasonStart <= block.timestamp || seasonEnd <= seasonStart
                || coverPerHousehold == 0 || earlyBps > BPS || consecutiveDays == 0
        ) revert BadSettings();
        siteId = _sites.length;
        Site storage s = _sites.push();
        s.name = name;
        s.manager = msg.sender;
        s.latE4 = latE4;
        s.lonE4 = lonE4;
        s.floodLevel = floodLevel;
        s.warnLevel = warnLevel;
        s.seasonStart = seasonStart;
        s.seasonEnd = seasonEnd;
        s.coverPerHousehold = coverPerHousehold;
        s.earlyBps = earlyBps;
        s.consecutiveDays = consecutiveDays;
        emit SiteAdded(siteId, msg.sender, name, floodLevel, seasonStart, seasonEnd);
    }

    /// Households are fixed once the season starts, so nobody can be added after a
    /// forecast shows a flood coming.
    function addHouseholds(uint256 siteId, address[] calldata list) external onlyManager(siteId) {
        Site storage s = _site(siteId);
        if (block.timestamp >= s.seasonStart) revert SeasonUnderway();
        address[] storage hs = _households[siteId];
        if (hs.length + list.length > MAX_HOUSEHOLDS) revert TooManyHouseholds();
        for (uint256 i; i < list.length; i++) {
            address h = list[i];
            if (h == address(0) || h == address(this) || isHousehold[siteId][h]) revert BadHousehold();
            isHousehold[siteId][h] = true;
            hs.push(h);
            emit HouseholdAdded(siteId, h);
        }
    }

    function removeHousehold(uint256 siteId, address h) external onlyManager(siteId) {
        Site storage s = _site(siteId);
        if (block.timestamp >= s.seasonStart) revert SeasonUnderway();
        if (!isHousehold[siteId][h]) revert BadHousehold();
        address[] storage hs = _households[siteId];
        for (uint256 i; i < hs.length; i++) {
            if (hs[i] == h) {
                hs[i] = hs[hs.length - 1];
                hs.pop();
                break;
            }
        }
        isHousehold[siteId][h] = false;
        emit HouseholdRemoved(siteId, h);
    }

    /// Starts a new season once the last one is over. Money left from the last
    /// season stays with the site.
    function renewSeason(uint256 siteId, uint64 seasonStart, uint64 seasonEnd) external onlyManager(siteId) {
        Site storage s = _site(siteId);
        if (block.timestamp <= s.seasonEnd) revert SeasonNotOver();
        if (seasonStart <= block.timestamp || seasonEnd <= seasonStart) revert BadSettings();
        s.seasonStart = seasonStart;
        s.seasonEnd = seasonEnd;
        s.earlyPaid = false;
        s.fullPaid = false;
        s.paidPerHousehold = 0;
        s.streak = 0;
        emit SeasonRenewed(siteId, seasonStart, seasonEnd);
    }

    // ------------------------------------------------------------------ money in

    /// Anyone can fund a site. Approve this contract on the USDC token first.
    function fund(uint256 siteId, uint256 amount) external {
        Site storage s = _site(siteId);
        if (amount == 0) revert ZeroAmount();
        uint256 before = usdc.balanceOf(address(this));
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        uint256 received = usdc.balanceOf(address(this)) - before;
        s.balance += received;
        emit Funded(siteId, msg.sender, received);
    }

    // ------------------------------------------------------------------ readings

    function postReading(uint256 siteId, uint32 day, uint32 observed, uint32 forecastMedianMax, bytes32 sourceHash)
        external
        returns (uint256 readingId)
    {
        if (msg.sender != reporter) revert NotReporter();
        Site storage s = _site(siteId);
        if (block.timestamp < s.seasonStart || block.timestamp > s.seasonEnd) revert OutOfSeason();
        if (day <= s.lastPostedDay) revert DayNotAfterLast();
        s.lastPostedDay = day;
        uint64 readyAt = uint64(block.timestamp) + challengeWindow;
        readingId = _readings.length;
        _readings.push(
            Reading({
                siteId: uint32(siteId),
                day: day,
                observed: observed,
                forecastMedianMax: forecastMedianMax,
                sourceHash: sourceHash,
                readyAt: readyAt,
                vetoed: false,
                settled: false
            })
        );
        emit ReadingPosted(readingId, siteId, day, observed, forecastMedianMax, sourceHash, readyAt);
    }

    /// The guardian can stop a reading before it settles, e.g. if the posted
    /// numbers don't match the published source data.
    function veto(uint256 readingId) external {
        if (msg.sender != guardian) revert NotGuardian();
        Reading storage r = _reading(readingId);
        if (r.settled || r.vetoed || block.timestamp >= r.readyAt) revert ReadingClosed();
        r.vetoed = true;
        emit ReadingVetoed(readingId);
    }

    /// Settles the next reading in line. Anyone can call it once the reading is ready.
    function settle(uint256 readingId) public {
        if (readingId != nextToSettle) revert OutOfOrder();
        Reading storage r = _reading(readingId);
        if (r.vetoed) {
            r.settled = true;
            nextToSettle = readingId + 1;
            emit ReadingSettled(readingId, r.siteId, _sites[r.siteId].streak);
            return;
        }
        if (block.timestamp < r.readyAt) revert NotReady();
        r.settled = true;
        nextToSettle = readingId + 1;

        Site storage s = _sites[r.siteId];
        if (r.observed >= s.floodLevel) {
            s.streak = (s.streak > 0 && r.day == s.lastSettledDay + 1) ? s.streak + 1 : 1;
        } else {
            s.streak = 0;
        }
        s.lastSettledDay = r.day;
        emit ReadingSettled(readingId, r.siteId, s.streak);

        if (!s.fullPaid && s.streak >= s.consecutiveDays) {
            s.fullPaid = true;
            s.earlyPaid = true;
            _pay(r.siteId, s, 1, uint256(s.coverPerHousehold) - s.paidPerHousehold);
        } else if (!s.earlyPaid && !s.fullPaid && r.forecastMedianMax >= s.floodLevel) {
            s.earlyPaid = true;
            _pay(r.siteId, s, 0, (uint256(s.coverPerHousehold) * s.earlyBps) / BPS);
        }
    }

    /// Settles up to `max` ready readings in order. Stops at the first one still waiting.
    function settleReady(uint256 max) external returns (uint256 done) {
        while (done < max && nextToSettle < _readings.length) {
            Reading storage r = _readings[nextToSettle];
            if (!r.vetoed && block.timestamp < r.readyAt) break;
            settle(nextToSettle);
            done++;
        }
    }

    // ------------------------------------------------------------------ views

    function siteCount() external view returns (uint256) {
        return _sites.length;
    }

    function site(uint256 siteId) external view returns (Site memory) {
        return _site(siteId);
    }

    function households(uint256 siteId) external view returns (address[] memory) {
        _site(siteId);
        return _households[siteId];
    }

    function readingCount() external view returns (uint256) {
        return _readings.length;
    }

    function reading(uint256 readingId) external view returns (Reading memory) {
        return _reading(readingId);
    }

    // ------------------------------------------------------------------ internals

    function _site(uint256 siteId) private view returns (Site storage) {
        if (siteId >= _sites.length) revert UnknownSite();
        return _sites[siteId];
    }

    function _reading(uint256 readingId) private view returns (Reading storage) {
        if (readingId >= _readings.length) revert ReadingClosed();
        return _readings[readingId];
    }

    /// Pays every household of the site the same amount. If the site holds less
    /// than the full amount, each household gets an equal share of what's there.
    function _pay(uint256 siteId, Site storage s, uint8 kind, uint256 perHousehold) private {
        address[] storage hs = _households[siteId];
        uint256 n = hs.length;
        if (n == 0 || perHousehold == 0) return;
        if (perHousehold * n > s.balance) perHousehold = s.balance / n;
        if (perHousehold == 0) return;
        uint256 total = perHousehold * n;
        s.balance -= total;
        s.paidPerHousehold += uint128(perHousehold);
        totalPaid += total;
        for (uint256 i; i < n; i++) {
            if (!usdc.transfer(hs[i], perHousehold)) revert TransferFailed();
        }
        emit Payout(siteId, kind, perHousehold, n, total);
    }
}
