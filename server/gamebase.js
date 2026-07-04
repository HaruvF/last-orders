'use strict';

// Shared minigame interface.
// A game receives the Room and drives itself via room helpers:
//   room.setTimer(seconds, cb)  — one active phase timer, auto-broadcast
//   room.clearTimer()
//   room.sync()                 — push fresh state to host + players
//   room.sfx(name) / room.fx(name)
//   room.toast(text)            — flash a banner on the host screen
//   room.gameFinished()         — hand control back to the room
// Subclasses implement: start(), onInput(player, data), hostView(), playerView(player)

class GameBase {
  constructor(room) {
    this.room = room;
    this.done = false;
    this.scores = {}; // per-game scores, folded into session scores at the end
  }

  get players() {
    return this.room.playerList(); // all joined players (connected or not)
  }

  addPoints(name, pts) {
    this.scores[name] = (this.scores[name] || 0) + pts;
  }

  gameScore(name) {
    return this.scores[name] || 0;
  }

  start() {}
  onInput(player, data) {} // eslint-disable-line no-unused-vars

  hostView() {
    return { type: 'wait' };
  }

  playerView(player) { // eslint-disable-line no-unused-vars
    return { type: 'wait', message: 'Hold your pint...' };
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.room.clearTimer();
    this.room.gameFinished(this.scores);
  }
}

module.exports = GameBase;
