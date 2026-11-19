# OutpostX phone app: set up (free, about 10 minutes, once)

The app is a small website that you put on GitHub (free) and add to your phone's home screen.

## 1. Put it on GitHub
1. Make a free account at github.com and sign in.
2. Press **+** (top right) > **New repository**. Name it `outpostx`. Choose **Public** (Pages is free for public repositories). Press **Create repository**.
3. On the new page press **uploading an existing file**. Unzip `OutpostX-phone-app.zip` on your computer, select everything inside the unzipped folder (including the `icons` folder) and drag it into the page. Press **Commit changes**.
4. Go to **Settings > Pages**. Under Branch choose `main` and folder `/ (root)`, then Save.
5. After a minute the page shows your address, like `https://YOURNAME.github.io/outpostx/`.

The app holds no private data. It is only the screens. Your emails and leads never go to GitHub.

## 2. Connect it to your sender
1. Update your OutpostX extension on the computer (copy the new files over the old folder, reload it) and update your sender code: Sender tab > Copy sender code > paste it over the old code in Apps Script > run `setup` > Deploy > Manage deployments > edit > New version.
2. In OutpostX, Sender tab, **Use OutpostX on your phone**: type your app address and press **Copy my phone link**.
3. Send that link to yourself (WhatsApp works) and open it on your phone in Chrome. It connects by itself.
4. In Chrome press the three dots > **Add to Home screen** (or **Install app**).

## Keep in mind
- The phone link contains the key to your sender. Treat it like a password and do not share it. If it leaks, make a new sender secret in the extension (Sender tab) and copy a new phone link.
- Use it on one phone you trust.

## New in this version
- **PIN**: set it in the extension (Sender tab > Phone app PIN). The app asks for it when you open it and after 3 minutes away. Forgot it? Set a new one in the extension, then press "Forgot PIN?" on the phone and type the new one.
- **Several Gmail accounts**: add them in the extension, then copy a NEW phone link (it carries all accounts) and open it on the phone. More > Gmail accounts switches between one account or "All accounts".
- **Follow-ups**: reminders show on Today. Set a lead status and reminder on each reply.
- **Find leads** (More > Find leads): winners of public contracts, and emails from website addresses. Tick people and add them to a campaign.
- **Do not contact**, **Sent history** and **Best performing subject lines** are under More.
