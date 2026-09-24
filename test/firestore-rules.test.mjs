// Firestore security rules tests for the lobby rework.
//
// Run with the Firestore emulator (see README note at the bottom of this
// file, or docs/LOBBIES.md, for the exact command).
//
// Uses Node's built-in test runner (node:test) rather than a new test
// framework dependency — this project has none currently.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, deleteDoc, getDoc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'putt-for-poverty-rules-test';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const HOST = 'host-uid';
const PLAYER = 'player-uid';
const OUTSIDER = 'outsider-uid';

async function seed(fixture) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await fixture(db);
  });
}

async function seedLiveLobbyWithChargedMember() {
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby1'), {
      name: 'Test Lobby',
      creatorId: HOST,
      creatorName: 'Host',
      isClosed: false,
      eventDate: Timestamp.now(),
      holes: 9,
      status: 'live',
      startedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'lobbies/lobby1/members/' + PLAYER), {
      userId: PLAYER,
      name: 'Player',
      joinedAt: Timestamp.now(),
      chargeStatus: 'charged',
    });
    await setDoc(doc(db, 'lobbies/lobby1/members/' + HOST), {
      userId: HOST,
      name: 'Host',
      joinedAt: Timestamp.now(),
      chargeStatus: 'charged',
    });
  });
}

test('a member cannot leave a live lobby', async () => {
  await seedLiveLobbyWithChargedMember();
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertFails(deleteDoc(doc(asPlayer, 'lobbies/lobby1/members/' + PLAYER)));
});

test('a member CAN leave a scheduled lobby (control)', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby2'), {
      name: 'Scheduled Lobby', creatorId: HOST, creatorName: 'Host', isClosed: false,
      eventDate: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000), holes: 9, status: 'scheduled',
      expiresAt: Timestamp.fromMillis(Date.now() + 13 * 60 * 60 * 1000), createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'lobbies/lobby2/members/' + PLAYER), {
      userId: PLAYER, name: 'Player', joinedAt: Timestamp.now(),
    });
  });
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertSucceeds(deleteDoc(doc(asPlayer, 'lobbies/lobby2/members/' + PLAYER)));
});

test('a non-member cannot read locations', async () => {
  await seedLiveLobbyWithChargedMember();
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby1/locations/' + PLAYER), {
      userId: PLAYER, lat: 51.5, lng: -0.1, updatedAt: Timestamp.now(),
    });
  });
  const asOutsider = testEnv.authenticatedContext(OUTSIDER).firestore();
  await assertFails(getDoc(doc(asOutsider, 'lobbies/lobby1/locations/' + PLAYER)));
});

test('a lobby member CAN read locations (control)', async () => {
  await seedLiveLobbyWithChargedMember();
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby1/locations/' + PLAYER), {
      userId: PLAYER, lat: 51.5, lng: -0.1, updatedAt: Timestamp.now(),
    });
  });
  const asHost = testEnv.authenticatedContext(HOST).firestore();
  await assertSucceeds(getDoc(doc(asHost, 'lobbies/lobby1/locations/' + PLAYER)));
});

test('a spectator (insufficient_credit) cannot write a scorecard', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby3'), {
      name: 'Live Lobby', creatorId: HOST, creatorName: 'Host', isClosed: false,
      eventDate: Timestamp.now(), holes: 9, status: 'live', startedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000), createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'lobbies/lobby3/members/' + PLAYER), {
      userId: PLAYER, name: 'Player', joinedAt: Timestamp.now(), chargeStatus: 'insufficient_credit',
    });
  });
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertFails(setDoc(doc(asPlayer, 'lobbies/lobby3/scorecards/' + PLAYER), {
    userId: PLAYER, name: 'Player', strokes: { '1': 4 }, total: 4, holesPlayed: 1, updatedAt: serverTimestamp(),
  }));
});

test('a charged member CAN write a scorecard (control)', async () => {
  await seedLiveLobbyWithChargedMember();
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertSucceeds(setDoc(doc(asPlayer, 'lobbies/lobby1/scorecards/' + PLAYER), {
    userId: PLAYER, name: 'Player', strokes: { '1': 4 }, total: 4, holesPlayed: 1, updatedAt: serverTimestamp(),
  }));
});

test('a client cannot set a lobby\'s status directly', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'lobbies/lobby4'), {
      name: 'Scheduled Lobby', creatorId: HOST, creatorName: 'Host', isClosed: false,
      eventDate: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000), holes: 9, status: 'scheduled',
      expiresAt: Timestamp.fromMillis(Date.now() + 13 * 60 * 60 * 1000), createdAt: Timestamp.now(),
    });
  });
  const asHost = testEnv.authenticatedContext(HOST).firestore();
  await assertFails(updateDoc(doc(asHost, 'lobbies/lobby4'), { status: 'live' }));
});

test('a client cannot create a lobby directly (server-only)', async () => {
  const asHost = testEnv.authenticatedContext(HOST).firestore();
  await assertFails(setDoc(doc(asHost, 'lobbies/lobby5'), {
    name: 'Direct Write', creatorId: HOST, creatorName: 'Host', isClosed: false,
    eventDate: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000), holes: 9, status: 'scheduled',
    expiresAt: Timestamp.fromMillis(Date.now() + 13 * 60 * 60 * 1000), createdAt: Timestamp.now(),
  }));
});

test('a client cannot change usedRounds on their own participant doc', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'participants/' + PLAYER), {
      userId: PLAYER, name: 'Player', golfClub: 'Test Club', handicap: 18, paidRounds: 5, usedRounds: 0,
    });
  });
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertFails(updateDoc(doc(asPlayer, 'participants/' + PLAYER), {
    usedRounds: 1, updatedAt: new Date().toISOString(),
  }));
});

test('a client CAN still update their own score (control)', async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'participants/' + PLAYER), {
      userId: PLAYER, name: 'Player', golfClub: 'Test Club', handicap: 18, paidRounds: 5, usedRounds: 1,
    });
  });
  const asPlayer = testEnv.authenticatedContext(PLAYER).firestore();
  await assertSucceeds(updateDoc(doc(asPlayer, 'participants/' + PLAYER), {
    score: 42, updatedAt: new Date().toISOString(),
  }));
});

// To run these tests locally:
//   1. npx firebase-tools emulators:start --only firestore
//   2. In another terminal: node --test test/firestore-rules.test.mjs
// Or in one step:
//   npx firebase-tools emulators:exec --only firestore "node --test test/firestore-rules.test.mjs"
