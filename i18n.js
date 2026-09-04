export const DEFAULT_LANGUAGE = "en";

const messages = {
  en: {
    skip: "Skip to content", homeAria: "Futbolista home", tagline: "The squad, in numbers.",
    language: "العربية", languageAria: "Switch language to Arabic", adminLogin: "Admin Login", logout: "Logout", export: "Export",
    dashboardEyebrow: "Squad overview", dashboardTitle: "Matchday pulse", dashboardLead: "Form, goals and the players setting the pace.",
    matches: "Matches", players: "Players", ranked: "Ranked", rightNow: "Right now", inForm: "In Form Players", last5: "Last 5",
    formFormula: "Win = 1 · Draw = 0.5 · Loss = 0", loadingForm: "Loading form…", monthlyAward: "Monthly award", playerMonth: "Player of the Month",
    monthFormula: "Attendance first · results second · goals lighter weight", loadingMonthly: "Loading monthly rankings…", finishing: "Finishing", topScorers: "Top Scorers",
    loadingScorers: "Loading scorers…", momentum: "Momentum", bestStreak: "Best Current Streak", loadingStreaks: "Loading streaks…",
    consistency: "Consistency", bestWinPct: "Best Win %", loadingPct: "Loading percentages…", latest: "Latest", latestMatch: "Latest Match", loadingLatest: "Loading latest match…",
    competitive: "Competitive ranking", leaderboard: "Leaderboard", leaderboardLead: "Eligible players ranked by the metric you choose.", standings: "Standings", formDefault: "Form is the default ranking.", sortBy: "Sort by", form: "Form", winPct: "Win %", goals: "Goals", gpm: "Goals per Match", wins: "Wins", currentStreak: "Current Win Streak", bestWinStreak: "Best Win Streak", loadingLeaderboard: "Loading leaderboard…",
    breakdown: "Full breakdown", statsTable: "Stats table", tableLead: "Scan every competitive metric in one place.", allEligible: "All eligible players", swipeTable: "Swipe the table horizontally on mobile.", name: "Name", loadingStats: "Loading statistics…", tableAria: "Player statistics table",
    squad: "The squad", playerStats: "Player Stats", playersLead: "Choose a player to open their full profile.", searchPlayers: "Search players", searchPlaceholder: "Search by name…", alpha: "Alphabetical", mostMatches: "Most matches", mostGoals: "Most goals", loadingPlayers: "Loading players…",
    sideBySide: "Side by side", comparePlayers: "Compare players", compareLead: "Head-to-head, teammate record and individual numbers.", playerA: "Player A", playerB: "Player B", selectPlayer: "Select player", swap: "Swap players", readyMatchup: "Ready for a matchup", selectTwo: "Select two different players to compare.",
    profile: "Player profile", backPlayers: "Players", mostTeammates: "Most Teammates", recentMatches: "Recent matches", neverPlayed: "Never played with", loadingConnections: "Loading connections…", showAll: "Show all", showLess: "Show less",
    archive: "Match archive", history: "Match History", historyLead: "Results, lineups, scorers and own goals.", searchHistory: "Search player", historyPlaceholder: "Find a player in matches…", allDates: "All dates", expandAll: "Expand all", collapseAll: "Collapse all", loadingMatches: "Loading matches…",
    adminWorkspace: "Admin workspace", managePlayers: "Manage players", manageLead: "Add squad members and review recorded totals.", adminOnly: "Admin only", addPlayer: "Add player", uniqueNames: "Names must be unique.", playerName: "Player name", playerPlaceholder: "e.g. Ahmed", squadList: "Squad list", loadingAdminPlayers: "Loading players…",
    matchEntry: "Match entry", entryLead: "Add one participation at a time. Existing match data stays untouched.", addMatchEntry: "Add match entry", date: "Date", player: "Player", result: "Result", team: "Team", goalType: "Goal type", win: "Win", draw: "Draw", loss: "Loss", teamA: "Team A", teamB: "Team B", normal: "Normal", ownGoal: "Own Goal", entryWarning: "Normal and own-goal entries may coexist. Identical entry types are blocked.", saveEntry: "Save entry", recentEntries: "Recent entries", loadingEntries: "Loading recent entries…",
    settings: "Settings", settingsLead: "Backups and protected data actions.", backup: "Backup", backupLead: "Download players and raw Firestore logs as JSON.", exportJson: "Export JSON", dangerZone: "Danger Zone", dangerLead: "Permanently deletes all players and logs after confirmation.", resetAll: "Reset all data",
    navDashboard: "Dashboard", navLeaderboard: "Leaderboard", navTable: "Table", navPlayers: "Players", navCompare: "Compare", navHistory: "History", navAdmin: "Admin", navEntry: "Entry", navSettings: "Settings", primaryNav: "Primary navigation",
    loginTitle: "Admin sign in", loginLead: "Use the authorized administrator account to unlock management tools.", email: "Email", password: "Password", showPassword: "Show password", hidePassword: "Hide password", cancel: "Cancel", signIn: "Sign in", signingIn: "Signing in…", close: "Close dialog",
    resetTitle: "Confirm permanent reset", resetLead: "This permanently deletes every player and match entry. A backup is strongly recommended first.", typeReset: "Type RESET to enable the destructive action.", confirmation: "Confirmation", confirmReset: "Permanently reset data",
    noMonthly: "No monthly data yet", noMonthlyLead: "A ranking will appear after a match is recorded.", showPast: "Show past months", hidePast: "Hide past months", score: "Score", current: "Current", best: "Best", shortWin: "W", shortDraw: "D", shortLoss: "L",
    noRanked: "No ranked players yet", noRankedLead: "Players appear after meeting the match eligibility rule.", noPlayers: "No players yet", noPlayersLead: "Players added by the admin will appear here.", noSearchPlayers: "No players match your search", noSearchPlayersLead: "Try another name or clear the search.",
    noMatches: "No matches yet", noMatchesLead: "Recorded match results will appear here.", noFilteredMatches: "No matching results", noFilteredMatchesLead: "Try another player or date filter.", noLatest: "No latest match", noLatestLead: "The newest recorded match will appear here.",
    noData: "Could not load data", noDataLead: "Check your connection, then refresh the page.", matchday: "Matchday", winners: "Winners", losers: "Losers", tie: "Tie", bestLabel: "Best", details: "Match details", month: "Month", year: "Year",
    headToHead: "Head-to-Head", againstEachOther: "Matches against each other", draws: "Draws", losses: "Losses", teammatesRecord: "Teammates Record", individualStats: "Individual Stats", playersNotFound: "Players not found", playersNotFoundLead: "Refresh the page and choose the players again.",
    noTeammates: "No teammate data yet.", noProfileMatches: "This player's match history will appear here.", noForm: "No matches yet", openProfile: "Open {name} profile", playedTogether: "{count}", streak: "Streak", duplicate: "Duplicate", noEntries: "No entries yet", noEntriesLead: "Saved match entries will appear here.", addFirstPlayer: "Add the first player using the form above.",
    loginFailed: "Login failed. Check the email and password, then try again.", invalidAdmin: "This account is not authorized for administration.", adminRequired: "Admin access is required.", signedOut: "Signed out safely.",
    enterName: "Enter a player name.", duplicatePlayer: "A player with this name already exists.", adding: "Adding…", playerAdded: "{name} was added to the squad.", playerAddFailed: "Could not add the player. Please try again.",
    choosePlayer: "Choose a player first.", invalidGoals: "Goals must be a whole number from 0 to 99.", invalidDate: "Enter a valid match date.", invalidSelection: "Choose a valid result and team.", alreadySaving: "This entry is already being saved.", duplicateEntry: "{type} entry already exists for this player in this match.", metadataMismatch: "Team and result must match this player's existing match entry.", saving: "Saving…", saved: "Match entry saved successfully.", saveFailed: "Could not save the entry. Please try again.",
    loadFailed: "Could not load the latest data. Check your connection and try again.", backupDone: "Backup downloaded successfully.", resetDone: "All data was reset.", resetting: "Resetting…", resetFailed: "Reset failed. No further action was taken.",
    navHint: "Swipe for more sections", latestResult: "{team} · {score}", versus: "vs", unknown: "Unknown"
  },
  ar: {
    skip: "انتقل إلى المحتوى", homeAria: "الرئيسية في فوتبوليستا", tagline: "فريقنا بالأرقام.",
    language: "English", languageAria: "تغيير اللغة إلى الإنجليزية", adminLogin: "دخول الإدارة", logout: "تسجيل الخروج", export: "تصدير",
    dashboardEyebrow: "إحصائيات الفريق", dashboardTitle: "ملخص الفريق", dashboardLead: "أبرز النتائج والأهداف ومستوى اللاعبين في مكان واحد.",
    matches: "المباريات", players: "اللاعبون", ranked: "في الترتيب", rightNow: "المستوى الحالي", inForm: "اللاعبون المتألقون", last5: "آخر 5 مباريات",
    formFormula: "الفوز نقطة · التعادل نصف نقطة · الخسارة بلا نقاط", loadingForm: "جارٍ تحميل النتائج الأخيرة…", monthlyAward: "جائزة الشهر", playerMonth: "لاعب الشهر",
    monthFormula: "الأولوية للحضور ثم النتائج، والأهداف عامل إضافي", loadingMonthly: "جارٍ تحميل ترتيب الشهر…", finishing: "الأهداف", topScorers: "الهدافون",
    loadingScorers: "جارٍ تحميل الهدافين…", momentum: "سلسلة الانتصارات", bestStreak: "أفضل سلسلة انتصارات حالية", loadingStreaks: "جارٍ تحميل سلاسل الانتصارات…",
    consistency: "النتائج", bestWinPct: "أفضل نسبة فوز", loadingPct: "جارٍ تحميل نسب الفوز…", latest: "آخر النتائج", latestMatch: "آخر مباراة", loadingLatest: "جارٍ تحميل آخر مباراة…",
    competitive: "إحصائيات الموسم", leaderboard: "ترتيب اللاعبين", leaderboardLead: "رتّب اللاعبين المؤهلين حسب الإحصائية التي تهمك.", standings: "قائمة الترتيب", formDefault: "الترتيب الافتراضي حسب نتائج آخر 5 مباريات.", sortBy: "الترتيب حسب", form: "المستوى", winPct: "نسبة الفوز", goals: "الأهداف", gpm: "معدل الأهداف", wins: "الانتصارات", currentStreak: "سلسلة الانتصارات الحالية", bestWinStreak: "أطول سلسلة انتصارات", loadingLeaderboard: "جارٍ تحميل الترتيب…",
    breakdown: "كل الإحصائيات", statsTable: "إحصائيات اللاعبين", tableLead: "كل أرقام اللاعبين المؤهلين في جدول واحد.", allEligible: "اللاعبون المؤهلون", swipeTable: "حرّك الجدول أفقيًا لرؤية بقية الإحصائيات.", name: "الاسم", loadingStats: "جارٍ تحميل الإحصائيات…", tableAria: "جدول إحصائيات اللاعبين",
    squad: "قائمة الفريق", playerStats: "اللاعبون", playersLead: "اختر لاعبًا لعرض إحصائياته وسجل مبارياته.", searchPlayers: "ابحث عن لاعب", searchPlaceholder: "اكتب اسم اللاعب…", alpha: "أبجديًا", mostMatches: "الأكثر مشاركة", mostGoals: "الأكثر تسجيلًا", loadingPlayers: "جارٍ تحميل اللاعبين…",
    sideBySide: "مقارنة مباشرة", comparePlayers: "قارن بين لاعبين", compareLead: "قارن المواجهات المباشرة واللعب معًا وإحصائيات كل لاعب.", playerA: "اللاعب الأول", playerB: "اللاعب الثاني", selectPlayer: "اختر لاعبًا", swap: "تبديل اللاعبين", readyMatchup: "ابدأ المقارنة", selectTwo: "اختر لاعبين مختلفين لعرض المقارنة.",
    profile: "الملف الشخصي", backPlayers: "العودة إلى اللاعبين", mostTeammates: "الأكثر لعبًا معه", recentMatches: "آخر المباريات", neverPlayed: "لم يشارك معهم", loadingConnections: "جارٍ تحميل بيانات الزملاء…", showAll: "عرض الكل", showLess: "عرض أقل",
    archive: "جميع المباريات", history: "سجل المباريات", historyLead: "النتائج والفرق والمسجلون والأهداف العكسية.", searchHistory: "ابحث عن لاعب", historyPlaceholder: "اكتب اسم اللاعب…", allDates: "كل التواريخ", expandAll: "عرض تفاصيل الكل", collapseAll: "إخفاء تفاصيل الكل", loadingMatches: "جارٍ تحميل المباريات…",
    adminWorkspace: "لوحة الإدارة", managePlayers: "إدارة اللاعبين", manageLead: "أضف لاعبين وراجع إحصائياتهم المسجلة.", adminOnly: "للإدارة فقط", addPlayer: "إضافة لاعب", uniqueNames: "استخدم اسمًا غير مكرر.", playerName: "اسم اللاعب", playerPlaceholder: "مثال: أحمد", squadList: "قائمة اللاعبين", loadingAdminPlayers: "جارٍ تحميل اللاعبين…",
    matchEntry: "تسجيل نتيجة", entryLead: "سجّل مشاركة كل لاعب على حدة من دون التأثير في المباريات السابقة.", addMatchEntry: "إضافة مشاركة لاعب", date: "التاريخ", player: "اللاعب", result: "النتيجة", team: "الفريق", goalType: "نوع الهدف", win: "فوز", draw: "تعادل", loss: "خسارة", teamA: "الفريق أ", teamB: "الفريق ب", normal: "هدف عادي", ownGoal: "هدف عكسي", entryWarning: "يمكن تسجيل أهداف عادية وعكسية للاعب نفسه، لكن لا يمكن تكرار الإدخال نفسه.", saveEntry: "حفظ المشاركة", recentEntries: "آخر المشاركات المسجلة", loadingEntries: "جارٍ تحميل المشاركات…",
    settings: "الإعدادات", settingsLead: "النسخ الاحتياطي وإدارة البيانات.", backup: "نسخة احتياطية", backupLead: "نزّل بيانات اللاعبين وسجلات Firestore بصيغة JSON.", exportJson: "تنزيل ملف JSON", dangerZone: "حذف البيانات", dangerLead: "يحذف جميع اللاعبين وسجلات المباريات نهائيًا بعد التأكيد.", resetAll: "حذف جميع البيانات",
    navDashboard: "الرئيسية", navLeaderboard: "الصدارة", navTable: "الجدول", navPlayers: "اللاعبون", navCompare: "المقارنة", navHistory: "السجل", navAdmin: "الإدارة", navEntry: "الإدخال", navSettings: "الإعدادات", primaryNav: "التنقل الرئيسي",
    loginTitle: "تسجيل دخول الإدارة", loginLead: "سجّل دخولك بحساب المدير للوصول إلى أدوات الإدارة.", email: "البريد الإلكتروني", password: "كلمة المرور", showPassword: "إظهار كلمة المرور", hidePassword: "إخفاء كلمة المرور", cancel: "إلغاء", signIn: "تسجيل الدخول", signingIn: "جارٍ تسجيل الدخول…", close: "إغلاق النافذة",
    resetTitle: "تأكيد حذف جميع البيانات", resetLead: "سيؤدي هذا إلى حذف جميع اللاعبين وسجلات المباريات نهائيًا. نزّل نسخة احتياطية أولًا.", typeReset: "اكتب RESET للمتابعة. لا يمكن التراجع عن هذا الإجراء.", confirmation: "التأكيد", confirmReset: "حذف جميع البيانات نهائيًا",
    noMonthly: "لا توجد نتائج لهذا الشهر", noMonthlyLead: "سيظهر لاعب الشهر بعد تسجيل المباريات.", showPast: "عرض الأشهر السابقة", hidePast: "إخفاء الأشهر السابقة", score: "النقاط", current: "الحالية", best: "الأطول", shortWin: "ف", shortDraw: "ت", shortLoss: "خ",
    noRanked: "لا يوجد لاعبون في الترتيب", noRankedLead: "يظهر اللاعب في الترتيب بعد بلوغ الحد الأدنى من المباريات.", noPlayers: "لا يوجد لاعبون", noPlayersLead: "يظهر هنا اللاعبون الذين تضيفهم الإدارة.", noSearchPlayers: "لا يوجد لاعب بهذا الاسم", noSearchPlayersLead: "جرّب اسمًا آخر أو امسح البحث.",
    noMatches: "لا توجد مباريات مسجلة", noMatchesLead: "تظهر هنا نتائج المباريات بعد تسجيلها.", noFilteredMatches: "لا توجد مباريات مطابقة", noFilteredMatchesLead: "جرّب اسم لاعب آخر أو اختر تاريخًا مختلفًا.", noLatest: "لا توجد مباريات مسجلة", noLatestLead: "تظهر هنا آخر مباراة بعد تسجيلها.",
    noData: "تعذر تحميل البيانات", noDataLead: "تحقق من اتصالك بالإنترنت ثم حدّث الصفحة.", matchday: "مباراة", winners: "فائز", losers: "خاسر", tie: "تعادل", bestLabel: "الأفضل", details: "تفاصيل المباراة", month: "الشهر", year: "السنة",
    headToHead: "المواجهات المباشرة", againstEachOther: "عدد المواجهات بينهما", draws: "التعادلات", losses: "الخسائر", teammatesRecord: "نتائجهما عند اللعب معًا", individualStats: "إحصائيات كل لاعب", playersNotFound: "تعذر العثور على اللاعبين", playersNotFoundLead: "حدّث الصفحة ثم اختر اللاعبين مرة أخرى.",
    noTeammates: "لا توجد مباريات مشتركة بعد.", noProfileMatches: "تظهر هنا مباريات اللاعب بعد تسجيلها.", noForm: "لا توجد مباريات حديثة", openProfile: "عرض ملف {name}", playedTogether: "{count}", streak: "السلسلة الحالية", duplicate: "مكرر", noEntries: "لا توجد مشاركات مسجلة", noEntriesLead: "تظهر هنا آخر المشاركات المحفوظة.", addFirstPlayer: "أضف أول لاعب من النموذج أعلاه.",
    loginFailed: "فشل تسجيل الدخول. تحقق من البريد وكلمة المرور ثم حاول مجددًا.", invalidAdmin: "هذا الحساب غير مصرح له بالإدارة.", adminRequired: "يلزم دخول المدير.", signedOut: "تم تسجيل الخروج بأمان.",
    enterName: "أدخل اسم اللاعب.", duplicatePlayer: "يوجد لاعب بهذا الاسم بالفعل.", adding: "جارٍ الإضافة…", playerAdded: "تمت إضافة {name} إلى الفريق.", playerAddFailed: "تعذرت إضافة اللاعب. حاول مرة أخرى.",
    choosePlayer: "اختر لاعبًا أولًا.", invalidGoals: "أدخل عددًا صحيحًا للأهداف من 0 إلى 99.", invalidDate: "أدخل تاريخًا صحيحًا للمباراة.", invalidSelection: "اختر النتيجة والفريق.", alreadySaving: "جارٍ حفظ هذه المشاركة بالفعل.", duplicateEntry: "سبق تسجيل {type} لهذا اللاعب في هذه المباراة.", metadataMismatch: "يجب أن يتطابق الفريق والنتيجة مع مشاركة اللاعب المسجلة.", saving: "جارٍ الحفظ…", saved: "تم حفظ المشاركة بنجاح.", saveFailed: "تعذر حفظ المشاركة. حاول مرة أخرى.",
    loadFailed: "تعذر تحميل أحدث البيانات. تحقق من اتصالك وحاول مرة أخرى.", backupDone: "تم تنزيل النسخة الاحتياطية.", resetDone: "تم حذف جميع البيانات.", resetting: "جارٍ حذف البيانات…", resetFailed: "تعذر حذف البيانات، ولم يتم إجراء أي تغيير.",
    navHint: "حرّك الشريط لرؤية بقية الأقسام", latestResult: "{team} · {score}", versus: "ضد", unknown: "غير معروف"
  }
};

export function translate(language, key, variables = {}) {
  const dictionary = messages[language] || messages[DEFAULT_LANGUAGE];
  const fallback = messages[DEFAULT_LANGUAGE][key] || key;
  return String(dictionary[key] || fallback).replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? ""));
}

export function directionFor(language) {
  return language === "ar" ? "rtl" : "ltr";
}

export function countText(language, count, noun) {
  const number = Number(count) || 0;
  if (language !== "ar") {
    const plurals = { match: "matches", goal: "goals", player: "players", win: "wins", draw: "draws", loss: "losses" };
    return `${number} ${number === 1 ? noun : (plurals[noun] || `${noun}s`)}`;
  }
  const forms = {
    match: { zero: "مباراة", one: "مباراة واحدة", two: "مباراتان", few: "مباريات", many: "مباراة" },
    goal: { zero: "هدف", one: "هدف واحد", two: "هدفان", few: "أهداف", many: "هدفًا" },
    player: { zero: "لاعب", one: "لاعب واحد", two: "لاعبان", few: "لاعبين", many: "لاعبًا" },
    win: { zero: "فوز", one: "فوز واحد", two: "فوزان", few: "انتصارات", many: "فوزًا" },
    draw: { zero: "تعادل", one: "تعادل واحد", two: "تعادلان", few: "تعادلات", many: "تعادلًا" },
    loss: { zero: "خسارة", one: "خسارة واحدة", two: "خسارتان", few: "خسائر", many: "خسارة" }
  }[noun];
  if (!forms) return `${number} ${noun}`;
  if (number === 0) return `0 ${forms.zero}`;
  if (number === 1) return forms.one;
  if (number === 2) return forms.two;
  const mod100 = number % 100;
  return mod100 >= 3 && mod100 <= 10
    ? `${number} ${forms.few}`
    : `${number} ${forms.many}`;
}
