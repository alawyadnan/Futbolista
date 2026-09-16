# Store listing draft — not submitted

Latest implementation, verification and owner deployment hold:
`SUBMISSION-STATUS-500408.md` (takes precedence over older preparation notes).

Actual native testing and the release blockers in `../README.md` are required
before submission. The owner approved direct App Store submission without
TestFlight after confirming the private iPhone build worked. The owner accepted
App Store Connect's first-use Terms of Service. A record was created and its
Arabic description, keywords and marketing URL were saved. No build has been
uploaded and nothing has been submitted for review or publicly released.

## App Store Connect record

- Apple app ID: **6812708570**
- Record: https://appstoreconnect.apple.com/apps/6812708570/distribution/ios/version/inflight
- Platform: iOS. Version: 1.0. Status: **Prepare for Submission**.
- Bundle ID: `live.ftbll.futbolista` (existing registered ID selected).
- SKU: `futbolista-ios`. Primary language: Arabic.
- Manual release selected while preparing the submission, so approval alone
  will not publish an incomplete or unconfirmed release automatically.
- Pricing saved as **Free ($0.00 base price)**. The saved Current Price dialog
  was reopened after reloading App Store Connect and confirmed zero prices.
- Owner requests **Unlisted** distribution, not a paid app or a private
  Apple Business custom app. Unlisted approval has **not** been requested or
  granted. Keep manual release until Apple approves this distribution method.
- Screenshots, support/privacy URLs, archive, review information and privacy/
  age-rating declarations remain incomplete. Do not infer readiness from
  successful record creation.
- A user-authorized **Add for Review** attempt on 16 September 2026 was blocked
  by App Store Connect validation (not an App Review rejection). Expanded errors:
  content rights, age-rating answers, privacy-policy URL, primary category,
  build selection, review contact information, App Privacy disclosures, and
  Arabic Support URL. Status remained **Prepare for Submission**. Screenshots
  were also empty. No build was uploaded and no review submission was created.

## Shared metadata

- Name: **Futbolista**
- Suggested category: Sports
- Registered bundle ID: `live.ftbll.futbolista`.
- Website: https://ftbll.live
- Owner-approved public support email: **allaw.68@gmail.com**.
- Support URL / Privacy URL: **not yet approved or published**. Do not use fake links.
- Age-rating, privacy and export-compliance answers: owner review required.

## العربية

العنوان الفرعي: **إحصائيات مبارياتنا**

تابع مباريات مجموعتك، تعرّف على اللاعبين المتألقين، وقارن أداءك عبر الموسم.

مع Futbolista يمكنك عرض النتائج والهدافين ونسب الفوز وسلاسل النتائج، والعودة إلى
سجل المباريات ومواجهات اللاعبين. شاهد جوائز MOTM وترتيب نقاط التصويت وجوائز الشهر،
وشارك ملفات اللاعبين والمقارنات مع أصدقائك.

تسجيل الدخول يستخدم حساب الموقع نفسه. المشاركة في التصويت تتطلب حسابًا مؤكّدًا
وربطًا بلاعب بموافقة الإدارة، وأن يكون اللاعب قد شارك في التمرين المعني.

## English

Subtitle: **Your pickup football stats**

Keep track of your squad's matches, discover in-form players and compare
performances across the season.

Explore results, goalscorers, win rates and streaks. Revisit match history and
head-to-head records, follow MOTM awards, voting points and monthly awards, and
share player profiles and comparisons with friends.

Use the same account as the Futbolista website. Voting requires a verified
account, an administrator-approved player link and participation in that workout.

## Review preparation

Explain public read-only statistics versus verified participant voting and
admin-only data entry. Supply real authorized review access and instructions
through App Store Connect when ready; never commit credentials to this project.
Do not ask reviewers to create or modify real production match data for testing.

Capture genuine iPhone screenshots after running the compiled application.
The current `qa/` screenshots are browser layout checks, not App Store screenshots.
The app currently requires connectivity for fresh Firebase data; do not advertise
full offline statistics, phone login, push notifications, automatic Universal
Links or account deletion until those capabilities are implemented and verified.

## Latest release decisions

- Apple Developer membership has been observed active as an Individual account.
- Direct App Store release is the owner's latest preference; do not enroll
  friends in TestFlight or spend effort on an internal beta unless requested again.
- Phone/SMS sign-in and additional usage-based billing were rejected. Do not
  enable Blaze, paid server functions, SMS authentication or billable services.
- Google and Apple sign-in were requested as alternatives, preserving existing
  email/password accounts and approved player links. With explicit owner consent,
  the **Google provider was enabled** in Firebase project `el-futbolistas`, with
  public project name Futbolista and support email allaw.68@gmail.com. Existing
  Email/Password remains enabled and the project remains on Spark. **Google UI
  and native integration are not implemented or tested yet**. Apple sign-in is
  not enabled or implemented. Do not advertise working social sign-in yet.
- The owner approved an in-app deletion request with manual processing within
  seven days. The actual request flow, protected admin handling, associated-data
  deletion procedure and user confirmation still need implementation and tests.
  This is not authorization to delete production accounts during development.
- Membership activation does not resolve privacy, deletion, authentication,
  screenshots, review access, archive validation or store-metadata requirements.

## Unlisted release gate

Apple requires a release-ready binary submitted to App Review before requesting
Unlisted distribution. Include the intent in Review Notes, submit the separate
request, and verify the distribution method becomes Unlisted App before manually
releasing. Do not publish publicly while waiting. Anyone with the eventual link
can download; the link is not an access-control mechanism. Existing participant
and administrator authorization must remain enforced.

Official workflow: https://developer.apple.com/support/unlisted-app-distribution/
