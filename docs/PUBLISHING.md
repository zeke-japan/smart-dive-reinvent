# Publishing checklist

This directory is prepared for a new repository named `smart-dive-reinvent`. Preparation does not create a remote or publish anything. The owner must review and approve the contents first.

1. Review README, architecture diagrams, limitations, third-party notices and SECURITY.md.
2. Review the index with `git status --short` and `git diff --cached`. Run `python3 scripts/check-public-source.py`.
3. Confirm images are synthetic and no `.env`, device signing state, real tokens, pairing codes or personal schedules are tracked.
4. Confirm the target GitHub owner and public visibility. Use the owner's normal authenticated Git/GitHub workflow.
5. After approval, create a new empty remote and push the reviewed files. Do not merge an older private history without scanning it first.
6. Verify the public README/images, repository license and links from a signed-out browser, then pass the repository URL to the submission Work.

Illustrative commands **for use only after approval**:

```bash
git init -b main
git add .
python3 scripts/check-public-source.py
git diff --cached --stat
git commit -m "Prepare Smart Dive hackathon source"
# Create the new empty public repository in your own GitHub account.
git remote add origin https://github.com/YOUR_USERNAME/smart-dive-reinvent.git
git push -u origin main
```

The local preparation checkout has no commits and no remotes. The downloadable archive omits `.git`; initialize it as shown above. You must set your own Git identity before committing. Do not paste access tokens into remote URLs or commit messages. Use normal credential management or SSH.
