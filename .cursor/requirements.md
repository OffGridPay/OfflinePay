# OfflinePay Bluetooth Relayer Requirements

## 1. Purpose

- Document functional and non-functional requirements for augmenting the OfflinePay wallet with Bluetooth Low Energy (BLE) capabilities that allow offline devices to hand off transactions to online peers acting as relayers.
- Ensure continuity with existing QR-based flows while enabling a seamless multi-device mesh that mirrors BitChat-style auto-discovery and Beacoin-style offline payments.

## 2. System Overview

- The system comprises multiple mobile wallet instances (React Native / Expo) using BLE to exchange signed transaction payloads and acknowledgements.
- Exactly one device in a local cluster may have active internet connectivity; this device dynamically assumes the "online relayer" role and bridges to the Ethereum network through the existing Node.js relayer service.
- Offline devices originate or receive signed transactions, exchange them via BLE without user-driven pairing, and rely on the online relayer for validation and broadcast.

## 3. Actors and Environments

- **Originator Device**: Offline or online device that creates a signed transaction (e.g., payment sender) and initiates BLE transfer.
- **Counterparty Device**: Device that receives the transaction payload (e.g., payment recipient) and monitors for acknowledgements.
- **Online Relayer Device**: Device detected as having internet connectivity; accepts BLE payloads, validates, and relays to blockchain via REST API.
- **Node.js Relayer Service**: Existing server responsible for broadcasting transactions and generating acknowledgement signatures.
- **BLE Mesh Cluster**: Ad hoc network of devices in proximity with BLE enabled.

Target platforms: Android first (due to BLE constraints) with iOS parity where feasible. Expo managed workflow with react-native-ble-plx (or Expo BLE module when stable) and background scans.

## 4. Key Scenarios

1. **Online Device Discovery**
   - Device periodically checks internet connectivity (Wi-Fi/cellular reachability).
   - Devices advertise their connectivity status over BLE advertisements.
   - Offline devices automatically detect at least one online relayer and flag it as available.

2. **Offline Transaction Broadcast**
   - Sender signs transaction offline.
   - Transaction payload is fragmented (if needed) and sent via BLE GATT characteristics or custom L2CAP data to the online relayer.
   - Relayer validates payload, responds with receipt acknowledgement, broadcasts to blockchain, then returns broadcast acknowledgement with tx hash.

3. **Fallback to QR**
   - If no online relayer discovered, UI prompts user to share via QR as current baseline.

4. **Mesh Relay (Optional Future)**
   - Devices can forward payloads between peers if relayer is not in direct range, inspired by BitChat’s multi-hop mesh.

## 5. Functional Requirements

### 5.1 Connectivity Detection

FR-1 Device must detect internet connectivity changes within 5 seconds using OS reachability APIs.
FR-2 Detected status must update shared state exposed to BLE broadcasting and the UI.
FR-3 Online devices must expose relayer capability only while internet reachability is confirmed.

### 5.2 BLE Discovery & Session Management

FR-4 Devices must run low-energy BLE advertisements containing:
     - App identifier / service UUID
     - Device role flag (`online`, `offline`, `relay-capable`)
     - Optional truncated public key for secure channel bootstrapping.
FR-5 Offline devices must scan continuously (foreground) and opportunistically (background if permitted) for advertisements with relayer flag.
FR-6 Users should not need to manually pair; connections use GATT with just-in-time bonding when encryption is required.
FR-7 Maintain a list of nearby relayers with RSSI, last-seen timestamp, and connection status.
FR-8 If multiple relayers available, select best candidate (strongest signal, least load, or round-robin).

### 5.3 Payload Transfer

FR-9 Transaction payload structure must include: signed transaction hex, metadata (amount, nonce, chain), originator signature, optional counterparty info.
FR-10 Payloads exceeding MTU must be chunked with sequence numbers and checksums; relayer acknowledges chunk receipt.
FR-11 Upon full payload assembly, relayer validates transaction signature and basic invariants (nonce freshness, gas limits, chain id).
FR-12 Relayer responds with **Receipt ACK** containing a signed confirmation that payload was received and validation succeeded or failed.

### 5.4 Broadcast Workflow

FR-13 For validated payloads, relayer forwards signed transaction to Node.js relayer via secure HTTP (HTTPS/TLS or within local trusted network).
FR-14 Node.js relayer returns broadcast result (success with tx hash; failure with reason).
FR-15 Online device packages broadcast result into **Broadcast ACK** BLE message, signed to prove authenticity, and sends back to originator and counterparty if available.
FR-16 Originator device saves acknowledgements locally (existing SQLite flow) and updates transaction history.
FR-17 If broadcast fails, failure reason must be relayed and surfaced in UI with retry option.

### 5.5 Security & Trust

FR-18 BLE channel must be encrypted; use ECDH key exchange leveraging wallet public keys to derive session keys.
FR-19 ACK signatures use relayer private key stored in secure enclave / Expo Secure Store on device.
FR-20 Validate that ACK signatures match expected relayer identity; reject mismatches.
FR-21 Protect against replay by including nonce/timestamp and tracking last seen ACK IDs.

### 5.6 Device Role Transitions

FR-22 When online relayer loses internet >10 seconds, it must broadcast state change and gracefully terminate active sessions.
FR-23 Offline device promoted to relayer must inherit outstanding transaction queue (if any) from peers or request retransmission.
FR-24 UI must reflect role (Relayer badge, active transfers indicator).

### 5.7 User Experience

FR-25 Provide user controls to enable/disable BLE relayer mode (with background permission prompts).
FR-26 Show real-time status: nearby relayers, transfer progress, acknowledgement timeline.
FR-27 Maintain accessibility: voiceover labels for statuses, color contrast for alerts.

### 5.8 Diagnostics & Logging

FR-28 Log BLE events (discoveries, connection drops, transfer bytes) with log levels and upload when device regains internet.
FR-29 Provide developer debug screen to view mesh topology and device roles.

## 6. Integration Requirements

- **Mobile App**: Extend BLE utilities, state management (Redux/Zustand), existing QR flows, UI screens.
- **Relayer Device**: New module to orchestrate validation and HTTP handoff to Node.js relayer.
- **Server Relayer**: Optional updates to accept BLE origin metadata, store device IDs, and issue double acknowledgements.
- **Database**: Update schema to store BLE acknowledgements (receipt + broadcast), with link to transaction record.

## 7. Non-Functional Requirements

- **Reliability**: 99% successful payload delivery under typical indoor BLE conditions (<10m). Automatic retry up to 3 attempts per chunk.
- **Latency**: Target <3 seconds from payload receipt to receipt ACK; <10 seconds to broadcast ACK assuming network available.
- **Security**: All communications encrypted; private keys never leave secure store; compliance with local data privacy laws.
- **Power Efficiency**: BLE advertising/scan intervals tuned to balance detection (<5s discovery) with battery impact (<5% hourly drain).
- **Scalability**: Support up to 10 concurrent devices in mesh cluster; future multi-hop routing optional.
- **Maintainability**: Modular BLE service with TypeScript type definitions and unit tests mocking BLE API.
- **Observability**: Relayer device reports anonymized metrics (success rate, RSSI distribution) to analytics when online.

## 8. Assumptions & Constraints

- Devices run Android 10+; iOS support may require background mode entitlements and user consent dialogs.
- Expo bare workflow may be necessary if managed workflow lacks required BLE APIs.
- Regulatory considerations for BLE advertising payload size (31 bytes for legacy, 255 bytes for extended); plan for compressed metadata.
- Mesh forwarding beyond single hop slated for Phase 2; MVP requires direct connect between offline device and a relayer.
- BLE security relies on devices keeping app in foreground for critical transfers until background support verified.

## 9. Open Questions

- Should relayer acknowledgement signing key be device wallet key or dedicated relayer keypair?
- How to synchronize pending transactions if relayer changes mid-transfer?
- What safeguards prevent malicious device from impersonating relayer during handshake?
- Do we require user consent before auto-sharing signed transactions over BLE?

## 10. Acceptance Criteria

- Demo scenario: 3 devices, 1 online, 2 offline. Offline device sends signed transaction via BLE; online device validates and relays; both receipt and broadcast acknowledgements received and stored; UI updates show success without manual pairing.
- Automated tests cover payload chunking, ACK verification, and role transitions.

## 11. Phase 0 Research Proposals

### 11.1 BLE Stack Evaluation (T0.1)

- **react-native-ble-plx (Polidea)**
  - Mature cross-platform BLE library; supports background mode on Android via headless JS + foreground service, iOS background modes with native setup.
  - Requires bare Expo workflow (prebuild) but integrates with TypeScript hooks and offers granular control (MTU negotiation, custom GATT services).
  - Needs additional setup for Android 12+ permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`) and optional foreground service for persistent scanning.
- **Expo BLE API**
  - Keeps project in Expo managed workflow, simplifying maintenance.
  - Currently limited for continuous background scanning, bonding callbacks, and extended advertising.
  - Viable for proof-of-concept but may not satisfy FR-4/FR-5 without workarounds; document gaps discovered during spike.
- **Custom Native Modules**
  - Full access to Android `BluetoothLeScanner` and iOS CoreBluetooth for mesh-level optimizations (extended advertisements, periodic sync).
  - High engineering overhead; consider only if plx/Expo BLE cannot meet security or performance targets.
- **Proposal**: Prototype with `react-native-ble-plx` in a bare-workflow branch; create comparison matrix vs Expo BLE; capture findings and blockers in Phase 0 report.
- **Execution Plan**:
  1. Create spike branch `spike/ble-stack-eval`; eject Expo project (`npx expo prebuild`) and document changes.
  2. Integrate `react-native-ble-plx`; implement minimal advertiser + scanner sample (`BleStackDemo.tsx`) logging discoveries with RSSI, MTU negotiation results, and background behaviour.
  3. Repeat experiment with Expo managed workflow using Expo BLE; log feature gaps (background scanning availability, max MTU, security callbacks).
  4. Populate comparison matrix including setup complexity, background support, encryption hooks, throughput, community maintenance signals (issue velocity).
  5. Summarize recommendation with quantified metrics (bytes/sec, discovery latency) and list blockers for shortlisted stack.
- **Spike Log Template**:
  - `date`, `device`, `platform`, `workflow (managed/bare)`, `library version`.
  - Setup steps executed (eject command output, native config tweaks) with references to commit hashes.
  - Experiment checklist:
    1. BLE advertise device identifier and observe discovery latency (seconds).
    2. Test MTU negotiation (target 247 bytes) and record success/failure.
    3. Measure sustained throughput (bytes/sec) for 30s transfer; note packet loss.
    4. Switch app to background where possible; observe scan/connection continuity.
    5. Validate encryption/bonding API availability.
  - Metrics table capturing `discoveryLatency`, `avgThroughput`, `batteryDrop (per 10 min)`, `backgroundSupport (Y/N)`, `notes`.
  - Issue list documenting blockers, library bugs, or permission hurdles.

### 11.2 Connectivity Detection Spike (T0.2)

- Implement quick prototype using `@react-native-community/netinfo` for reachability and `Expo Network` for connection type metadata.
- Measure detection latency across airplane mode toggles, Wi-Fi dropouts, and cellular toggles; target <5s consistent with FR-1.
- Evaluate periodic heartbeat (lightweight HTTPS HEAD to relayer server) to confirm “usable internet” vs captive portal.
- Investigate Android `ConnectivityManager.registerDefaultNetworkCallback` behavior when app runs foreground service (required for relayer role persistence).
- Deliverable: `ConnectivityService` design doc (event schema, state transitions, offline->online promotion logic) and spike code snippet validated on Android emulator/physical device.
- **Execution Plan**:
  1. Build `useConnectivityMonitor` hook wrapping NetInfo subscription; capture timestamps (`Date.now`) on change events and compute latency from manual toggles.
  2. Add optional active check (`HEAD /health` on relayer API) with configurable timeout; record success/failure counts to local log.
  3. On Android emulator and physical device, script test matrix: Wi-Fi off/on, airplane mode, captive portal simulation; store results in CSV for analysis.
  4. Explore foreground service integration (if using bare workflow) to observe callback viability when app backgrounded; document OS requirements/notifications.
  5. Produce short report summarizing average detection latency, variance, battery impact observations, and recommendations for production `ConnectivityService` thresholds.
- **Logging Template**:
  - Event schema `{ timestamp, trigger (wifi-toggle | airplane | heartbeat-fail), netinfoState, latencyMs, activeCheckResult, batteryLevel }` stored locally (e.g., SQLite or JSON log in dev builds).
  - CSV report columns: `scenario`, `run`, `latencyMs`, `netinfoOnline`, `activeCheckPass`, `notes`.
  - Checklist for each scenario: ensure baseline connectivity recorded, toggle action executed, latency measured thrice, compute mean/median.
  - Document observed OS notifications or permission prompts when registering background callbacks.

### 11.3 BitChat Mesh Analysis (T0.3)

- Review BitChat BLE mesh documentation and available code samples to understand:
  - Advertisement payload structure (role bits, hop count, message digest).
  - Relay logic to prevent duplicate forwarding (message ID cache, TTL).
  - Connection orchestration when transferring large payloads.
- Document which concepts can be adapted for OfflinePay Phase 2 multi-hop (FR-optional) vs MVP.
- Capture risks: battery impact of continuous mesh operation, iOS background restrictions, data rate limits (~1-2 kbps per connection).
- **Research Summary**:
  - BitChat uses BLE advertisements with a custom service UUID broadcasting compact payloads containing sender ID, hop-count (`TTL`), and checksum. Messages propagate through multi-hop relays, each device decrementing the TTL before re-advertising.
  - Deduplication achieved via a rolling Bloom filter keyed by message hash to avoid re-forwarding.
  - Data plane relies on switching to GATT connections for payloads > 20 bytes, with chunking handled application-side; mesh is primarily for discovery and short control messages.
  - Energy optimization: adaptive duty cycling—devices slow advertisement intervals when few peers detected; wake up more frequently upon message receipt.
- **Execution Plan**:
  1. Collect source snippets / whitepapers (BitChat GitHub, blog posts) and archive references in knowledge base.
  2. Tabulate features vs OfflinePay requirements (auto-discovery, relay TTL, dedupe strategy) noting which apply to Phase 1 vs Phase 2 roadmap.
  3. Prototype pseudocode for message cache + TTL handling to evaluate feasibility in React Native environment (AsyncStorage/SQLite).
  4. Identify risk register: battery drain (expected +20% with aggressive intervals), iOS 13 background advertisement limitations, regulatory constraints on advertisement payload size.
  5. Produce briefing document summarizing adoptable techniques and open questions for multi-hop (e.g., trust model, sybil protection).
- **Deliverables**:
  - Comparative matrix (BitChat vs OfflinePay) listing mesh features and adoption decisions.
  - Draft pseudocode for message dedupe cache and TTL management.
  - Risk log entry for mesh vs MVP.

### 11.4 Beacoin Workflow Learnings (T0.4)

- Study Beacoin’s approach to offline merchant discovery and transaction confirmation.
- Note UX elements: device availability indicators, PIN confirmation screens, acknowledgement timelines.
- Analyze how Beacoin secures BLE channel (encryption, authentication) and whether they rely on central server for final settlement.
- Produce UX recommendations for OfflinePay: e.g., optional transaction PIN before BLE send, aliasing relayer devices, progress indicators for dual acknowledgements.
- **Research Summary**:
  - Beacoin leverages BLE beacons broadcasting merchant IDs; app auto-detects nearby merchants and displays status cards with distance indicators (based on RSSI).
  - Transactions require user-entered PIN, with offline signing and encrypted payload sent to beacon/merchant device; acknowledgement includes merchant signature and timestamp.
  - UX highlights dual-phase confirmation: “Payment sent” followed by “Merchant confirmed”, giving users confidence in offline flow.
  - Security relies on pre-shared merchant certificates embedded in the app, plus rotating session keys negotiated via beacon handshake.
- **Execution Plan**:
  1. Capture screenshots / flow descriptions from Beacoin documentation and classify UI patterns (discovery list, confirmation modals, error states).
  2. Map Beacoin security steps to OfflinePay requirements (transaction PIN, handshake prompts, acknowledgement screens).
  3. Draft UX/UI recommendations: relayer badge, progress timeline, optional PIN gating, warning for untrusted relayers.
  4. Evaluate feasibility of pre-provisioned relayer certificates vs dynamic trust (wallet-signed introspection).
  5. Update product backlog with UX enhancements informed by Beacoin (e.g., aliasing relayer devices, user consent before broadcast).
- **Deliverables**:
  - UX reference document with annotated Beacoin patterns.
  - Recommendation list for OfflinePay UI/UX and security prompts.
  - Decision memo on adopting PIN gating and relayer identity surfacing.

### 11.5 Architecture & Sequence Deliverables (T0.5)

- Create sequence diagrams for:
  - Offline sender -> online relayer handshake + payload transfer + dual ACK responses.
  - Relayer role revocation when connectivity lost (FR-22) and failover to new relayer.
  - Error handling path (invalid signature, chunk failure) showing retries and user prompts.
- Update high-level architecture diagram to include Connectivity Service, BLE Manager, Transaction Orchestrator, and Node.js relayer interactions.
- Define data contracts (JSON schemas) for receipt ACK, broadcast ACK, and BLE chunk headers; align with FR-9 through FR-17.
- **Execution Plan**:
  1. Draft mermaid-based sequence diagrams (to be embedded in docs) for the three core flows; validate with engineering team.
  2. Create architecture diagram (e.g., Whimsical / Excalidraw) showing modules: ConnectivityService, BleMeshManager, TransactionOrchestrator, Persistence, Relayer API.
  3. Define JSON schemas for `PayloadChunk`, `ReceiptAck`, `BroadcastAck`, including required fields, signatures, and validation rules.
  4. Review diagrams against requirements to ensure coverage of role transitions, retries, and error messaging.
  5. Publish architecture pack in repository docs (`docs/architecture/phase0`) for stakeholder review.
- **Deliverables**:
  - Three sequence diagrams (sender→relayer flow, relayer failover, error/retry path).
  - System context/architecture diagram.
  - Draft JSON schemas for BLE payload/ACK structures.

### 11.6 BLE Service Definition Draft (T0.6)

- Propose primary service UUID and characteristic layout:
  - `ControlCharacteristic` (Write/Notify) for role negotiation, handshake messages, status updates.
  - `PayloadCharacteristic` (Write Without Response) for encrypted chunk transfer with session ID + sequence + checksum fields.
  - Optional `TelemetryCharacteristic` for diagnostics (RSSI, error codes) supporting FR-28/FR-29.
- Outline handshake steps using ECDH (wallet public keys) producing AES-GCM session key; include nonce/timestamp for replay protection per FR-21.
- Assess bonding requirements per platform; document fallback (application-level encryption if BLE link not bonded).
- Prepare experiment plan to validate MTU limits, throughput, and error recovery on representative devices.
- **Execution Plan**:
  1. Assign preliminary 128-bit UUIDs (temporary namespace) and document characteristic properties (Write, Notify, Indicate) plus max payload sizes per MTU.
  2. Specify chunk header format (bytes: `[sessionId(4)][seq(2)][flags(1)][payloadChecksum(2)]`).
  3. Detail handshake protocol steps: ECDH key exchange, challenge-response for relayer authentication, session key derivation (HKDF), and message nonce strategy.
  4. Evaluate platform-specific bonding flows (Android JustWorks/BLE pairing vs iOS LESC) and decide when to request pairing.
  5. Design validation experiments: measure MTU negotiation success on Android/iOS, throughput tests for different intervals, and error injection for retransmission logic.
- **Deliverables**:
  - BLE service definition document (UUIDs, characteristics, permissions, data formats).
  - Handshake flow description with cryptographic primitives and pseudocode.
  - Experiment checklist + metric targets for MTU/throughput/reliability.


