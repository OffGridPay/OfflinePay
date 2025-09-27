# OfflinePay BLE Relayer Task Breakdown

## Phase 0 – Research & Architecture (Week 1)

- T0.1 Evaluate Expo BLE capabilities; decide between `react-native-ble-plx`, Expo BLE module, or native bridges.
- T0.2 Spike on connectivity detection APIs (NetInfo, Expo Network) and experiment with background updates.
- T0.3 Review BitChat BLE mesh approach; extract patterns for auto-discovery and connection orchestration.
- T0.4 Assess Beacoin offline payment workflow for security and UX references.
- T0.5 Finalize architecture diagram and sequence flows for payload transfer and acknowledgements.
- T0.6 Define BLE service UUIDs, characteristic schema, chunking strategy, and security handshake protocol.

## Phase 1 – Foundations (Weeks 2-3)

- T1.1 Implement connectivity detection hook/service updating global state and emitting role change events.
- T1.2 Build BLE manager module: advertising, scanning, connection lifecycle, device registry (nearby relayers).
- T1.3 Create role selection logic prioritizing strongest relayer; expose status to UI store.
- T1.4 Prototype BLE payload channel with chunking + checksum, including retry logic.
- T1.5 Implement secure session handshake (ECDH key exchange, session key derivation) and mutual authentication.
- T1.6 Provide developer diagnostics screen showing detected devices, roles, RSSI, session logs.

## Phase 2 – Transaction Relay Integration (Weeks 4-5)

- T2.1 Integrate payload packaging on sender side (serialize signed transaction + metadata).
- T2.2 Implement relayer-side payload assembly, validation (ethers.js), and error reporting.
- T2.3 Extend mobile app to send Receipt ACK following validation, signed with relayer key.
- T2.4 Connect relayer device to Node.js relayer REST API; handle success/failure responses.
- T2.5 Implement Broadcast ACK generation and BLE delivery back to originator/counterparty.
- T2.6 Persist acknowledgements in SQLite; update transaction history and UI feedback.

## Phase 3 – UX & Reliability (Weeks 6-7)

- T3.1 Enhance UI to display relayer availability, transfer progress, and acknowledgement timeline.
- T3.2 Add retry management (chunk retransmission, session restart) with user prompts on repeated failures.
- T3.3 Optimize power usage: tune scan intervals, background modes, and idle behavior.
- T3.4 Implement analytics/log upload when device online; include BLE metrics and error codes.
- T3.5 Add localization strings and accessibility tags for new UI elements.

## Phase 4 – Testing & Launch Prep (Weeks 8-9)

- T4.1 Author unit/integration tests for connectivity service, BLE manager, and payload handlers.
- T4.2 Build end-to-end test harness simulating multi-device BLE sessions (emulator or physical lab setup).
- T4.3 Conduct security review: penetration test for BLE MITM, replay, and spoofing scenarios.
- T4.4 Update documentation: architecture diagrams, setup guides, troubleshooting for BLE relayer mode.
- T4.5 Run pilot with 3-4 devices; collect metrics and iterate on UX/power tuning.

## Phase 5 – Future Enhancements (Backlog)

- B5.1 Implement multi-hop mesh routing for relayer discovery beyond direct range.
- B5.2 Support encrypted message relays for chat-style notifications between users.
- B5.3 Introduce prioritized relayer selection based on device battery level and history.
- B5.4 Explore bridging to multiple blockchain networks or Layer-2 solutions.
- B5.5 Build admin console to monitor relayer swarm health and analytics.


