# 🍺 LAST ORDERS

A Jackbox-style party game for **4–8 players** set in a grungy fantasy pub. The main game
shows on a shared screen (TV / laptop); players join and play from their phones with a
4-letter room code. Everything runs locally on your home network — no accounts, no internet
services, no database.

**The four minigames**

| Game | Style | The gist |
|---|---|---|
| **Tall Tales** | Fibbage-style bluffing | Write a lie for a weird true fact, find the truth, fool your mates. 3 escalating rounds + a double-points Last Call. |
| **Trivia Murder Pub** | Trivia Murder Party-style | A killer landlord quizzes you on games & anime. Get it wrong → punishment minigames (poisoned pints, loaded darts, brutal math, memory tests). Die → become a ghost → steal a body in the escape finale. |
| **Bar Brawl** | Quiplash-style roast battle | Two patrons answer the same absurd pub prompt; everyone else votes. Unanimous = KNOCKOUT bonus. Everyone fights at least twice. |
| **Darts of Destiny** | Estimation / wagering | Throw a dart at a number line to guess numeric trivia. Closest wins — unless you land in the hidden GUTTER. Side-bet your bank on whose dart you trust. |

Points accumulate on the session **Bar Tab** chalkboard; the last game ends with the Final Reckoning.
Scoring is balanced so each minigame is worth roughly the same (~1,000–1,500 for a strong showing) —
no single game decides the night.

**⚖️ Pub Justice:** perform really well and you earn a punishment token — announced on the big
screen, spent from your phone. Earned by: answering 2 trivia questions in a row (Trivia Murder Pub),
fooling 2+ players with one lie (Tall Tales), scoring a Knockout (Bar Brawl), or landing 2 closest
darts (Darts of Destiny). Spend it to drench a player of your choice (−100 points)… or hit
**🎲 RANDOM ROLL** and let fate pick the victim.

**Emoji heckling:** during voting rounds, reveals and scoreboards, an emoji bar appears on every
phone (😂 🔥 💀 🍺 👏 🤮 😱 🖕). Tap one and it floats up the big screen with your name on it.
Rate-limited so nobody can flood the pub.

**Avatars:** in the lobby, tap any patron on your phone to change your look (no two players can
wear the same face). Each game also gets its own animated background on the big screen — drifting
scrolls for Tall Tales, skulls and a pulsing blood-red vignette for Trivia Murder Pub, flying
tankards for Bar Brawl, stray darts for Darts of Destiny.

## Setup

Requires [Node.js](https://nodejs.org) 16+.

```bash
cd last-orders
npm install
npm start
```

The console prints two URLs:

```
Big screen (TV):   http://localhost:3044/host
Phones (players):  http://192.168.x.x:3044/play
```

## How to run game night

1. **On the TV / shared laptop:** open the `/host` URL in a browser and click **OPEN THE PUB**
   (that click enables sound). A 4-letter room code appears top-right.
   - Casting a laptop browser tab to a TV via HDMI or Chromecast works great.
2. **On each phone:** connect to the **same Wi-Fi network**, open the `http://<your-ip>:3044/play`
   URL shown in the console (also shown on the host screen), enter the room code + a nickname.
   Works in mobile Safari and Chrome.
3. The **first player to join is the party leader** (👑). Once everyone's in (4–8 players is the
   sweet spot; it technically runs with 2), the leader taps **CHOOSE GAMES** and either picks a
   set of games (3 makes a good ~45 min session) or orders the **FULL PUB CRAWL** (all four).
4. Play! All prompts, reveals and scoreboards show on the big screen; phones only ever show the
   one input you need right now.

### Disconnects & rejoins

Phones drop off Wi-Fi all the time — no problem. Rejoin from the same phone and it reconnects
automatically (it remembers your room + nickname), or type the **same nickname** and room code
on any device to take over your seat mid-game. The host screen can also be reloaded; it reclaims
the room within 3 minutes.

### Firewall note (Windows)

The first time you run `npm start`, Windows may ask to allow Node.js through the firewall —
allow it on **Private networks** or phones won't be able to connect.

### If phones can't connect

- Make sure phone and computer are on the same network (guest Wi-Fi networks often isolate devices).
- Find your computer's IP manually: `ipconfig` (Windows) / `ifconfig` (Mac) — use the IPv4 address.
- Try a different port: `set PORT=8080 && npm start` (Windows) or `PORT=8080 npm start` (Mac/Linux).

## Testing without friends

Run the server in fast mode (all timers ÷10), then launch 5 simulated players who
play a full pub crawl with random inputs:

```bash
# terminal 1 (Windows PowerShell):
$env:FAST=1; npm start

# terminal 2:
npm run sim
```

The sim prints every scene transition and exits with `SIM OK` when the final scoreboard is reached.

## Code layout

```
server/
  index.js        — Express + Socket.io bootstrap, LAN IP printout
  room.js         — room codes, lobby, reconnects, session state machine, Bar Tab
  gamebase.js     — the shared minigame interface
  games/          — one self-contained module per minigame
  content/        — all prompts/questions as JSON (easy to extend!)
public/
  host/           — the big-screen renderer
  play/           — the phone controller (generic input widgets)
  avatars.js      — 12 original comic-style SVG pub patrons
  audio.js        — procedural Web Audio sound kit (no assets)
```

**Adding a minigame:** create `server/games/yourgame.js` extending `GameBase`
(implement `start`, `onInput`, `hostView`, `playerView`), register it in the `GAMES`
map in `server/room.js`, and add host renderers for your view types in
`public/host/host.js`. The phone side is generic — reuse the existing widget types
(`text`, `choices`, `slider`, `bet`, `memory`) and you won't need to touch `play.js` at all.

All art, prompts, questions and audio are original. The comic-book pub aesthetic is
pure CSS/SVG — no external assets.
