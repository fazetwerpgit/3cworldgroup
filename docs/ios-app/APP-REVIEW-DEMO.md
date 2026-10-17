# App Review demo account and chat sandbox

Ops note. Nothing here runs by itself: each step is a manual, one-time action
in production, done by an owner/admin. Do it before submitting a build.

## What App Review gets

- A sign-in that is a real, active portal user flagged `demoAccount: true`.
  It is left out of every roster, leaderboard, recipient list and owner count
  (`src/lib/users/demoAccount.ts`), and the sales it logs are stamped and
  hidden from everyone else.
- One chat channel, the **demo sandbox**, named "Demo Team" (`chatChannels/{id}.demoSandbox: true`,
  `src/lib/chat/channels.ts`), so the reviewer can send, report and block
  (App Store guideline 1.2) without reaching a real person:
  - A demo account can read and post ONLY in a sandbox channel. Every other
    channel denies it, even if its uid sits in `extraMemberIds`.
  - A sandbox's `memberIds` is demo accounts plus admins/owners, set by the
    channel sync and by each person's channel-list reconcile. Audience and
    `extraMemberIds` are ignored there; the admin "add member" and "change
    audience" actions refuse a sandbox.
  - Reps, managers and operations never see the channel. Admins/owners do,
    so they can moderate it, and they get its pushes. It shows in their
    channel list as "Demo Team".
  - Its messages appear nowhere else: leaderboard callouts and the owner
    book read only `all-company`, the company tape reads sales, and Ask reads
    no chat.
  - Report and block work as everywhere else; reports land in the admin
    chat-reports queue and alert the back office as usual.

## One-time production setup

1. **Create two accounts** through the normal signup (team code `3cteam`):
   - the reviewer account (the credentials go in App Store Connect), and
   - a second fake person, e.g. "Sam Demo", whose messages the reviewer can
     report and block. Give neither a real name, phone or photo.
   Approve both as active with a plain rep role.

2. **Flag both accounts.** In the Firebase console, on each `users/{uid}`
   doc set `demoAccount: true` (boolean, not the string `"true"`).

3. **Create the sandbox channel doc** `chatChannels/app-review`:

   ```json
   {
     "id": "app-review",
     "name": "Demo Team",
     "description": "Say hi to the team.",
     "audience": "all",
     "order": 1,
     "active": true,
     "demoSandbox": true,
     "memberIds": []
   }
   ```

   `audience` must be a valid value for the channel to parse, but it is not
   used for a sandbox. `memberIds` is filled by step 5.

   Note for admins and owners: "Demo Team" is the App Review demo channel.
   Only the demo accounts and admins/owners are in it, and no real rep reads
   it. Do not use it for team messages. Leave it alone except to moderate a
   report, and archive it as below when review is done.

4. **Seed a few messages** from the second demo user under
   `chatChannels/app-review/messages/{autoId}`, one doc each:

   ```json
   {
     "channelId": "app-review",
     "text": "Morning! Knocking the north side today.",
     "authorId": "<second demo uid>",
     "authorName": "Sam Demo",
     "authorRole": null,
     "createdAt": <timestamp>
   }
   ```

   Three or four short, friendly lines with timestamps a few minutes apart
   are enough. Then set `lastMessage` (`{ messageId, authorId, authorName,
   text }`) and `lastMessageAt` on the channel doc to match the newest one,
   so the channel list shows a preview. Do not seed anything offensive: the
   reviewer only needs something to report.

5. **Run the channel sync**: `POST /api/portal/chat/channels/sync` with an
   admin's Firebase ID token as `Authorization: Bearer <token>` (there is no
   button for it; copy the token from any authenticated portal API request in
   a signed-in admin tab's network panel). It writes the sandbox's
   `memberIds` (both demo accounts plus every admin/owner) and drops the demo
   accounts from every other channel's `memberIds`, which the Firestore read
   rules use.

6. **Check it** while signed in as the reviewer on a real phone: the chat list
   shows only the sandbox; a send, a report and a block all work; the report
   shows up in the admin chat-reports queue. Signed in as a rep, the sandbox
   is not in the list.

## After review

Set `active: false` on the sandbox channel (archiving closes it to everyone,
the demo accounts included), then disable or delete both demo accounts. To
reuse it for the next review, set `active: true` again and re-run the sync.

## Notes

- Flagging later: if an existing account is flagged after it joined real
  channels, run the sync (step 5) right away. The chat API denies it at once,
  but Firestore rules follow `memberIds`, which only the sync rewrites.
- An admin/owner promoted or demoted later is added to or dropped from the
  sandbox on their next channel-list load or the next sync.
