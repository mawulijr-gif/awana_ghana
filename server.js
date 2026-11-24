const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("Set SESSION_SECRET before starting the server.");
}
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "public", "uploads");
const resourceUploadDir = path.join(uploadDir, "resources");
const registrationPhotoDir = path.join(dataDir, "registration-photos");
const registrationIdentificationDir = path.join(dataDir, "registration-identifications");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(resourceUploadDir, { recursive: true });
fs.mkdirSync(registrationPhotoDir, { recursive: true });
fs.mkdirSync(registrationIdentificationDir, { recursive: true });

const db = new Database(path.join(dataDir, "awana.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'administrator'
  );
  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, telephone TEXT, organisation TEXT,
    subject TEXT, message TEXT, status TEXT DEFAULT 'New', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_name TEXT NOT NULL,
    child_dob TEXT NOT NULL,
    programme TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    guardian_relationship TEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    guardian_email TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL,
    consent INTEGER NOT NULL DEFAULT 0,
    rank TEXT NOT NULL DEFAULT '',
    club_name TEXT NOT NULL DEFAULT '',
    photos TEXT NOT NULL DEFAULT '[]',
    identification_type TEXT NOT NULL DEFAULT '',
    identification_file TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT, last_name TEXT, email TEXT UNIQUE, location TEXT,
    consent INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, summary TEXT, date TEXT, time TEXT, venue TEXT, status TEXT DEFAULT 'Published'
  );
  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT, question TEXT, answer TEXT, sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cms_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL DEFAULT '',
    event_time TEXT NOT NULL DEFAULT '',
    venue TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, slug)
  );
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const registrationColumns = new Set(db.pragma("table_info(registrations)").map(column => column.name));
for (const [name, definition] of [
  ["rank", "TEXT NOT NULL DEFAULT ''"],
  ["club_name", "TEXT NOT NULL DEFAULT ''"],
  ["photos", "TEXT NOT NULL DEFAULT '[]'"],
  ["identification_type", "TEXT NOT NULL DEFAULT ''"],
  ["identification_file", "TEXT NOT NULL DEFAULT ''"]
]) {
  if (!registrationColumns.has(name)) {
    db.exec(`ALTER TABLE registrations ADD COLUMN ${name} ${definition}`);
  }
}

const defaultCmsItems = [
  ["pages", "about", "About Awana Ghana", "Partnering with churches to help children and young people know, love and serve Jesus.", "Faith for a lifetime\n\nAwana Clubs Ghana supports local churches as they build welcoming, engaging environments where children can explore the Bible and grow in faith.\n\nOur approach brings biblical teaching, caring relationships and fun activities together. We work alongside churches, leaders and families to encourage the next generation.", "", "About", 1],
  ["pages", "programmes", "Children's programmes", "Age-aware club experiences that help children engage with Scripture, build relationships and grow in faith.", "A pathway for every stage\n\nProgramme names and age groups below are examples from the Awana model. Please contact us to confirm which programmes are currently offered by participating churches.", "", "Programmes", 1],
  ["pages", "how-it-works", "How the programme works", "A typical club session brings Bible learning, small-group connection and active play together.", "Three ways to learn and belong\n\nLarge-group time: Children gather for a shared welcome, worship, Bible teaching or a story.\n\nSmall-group time: Leaders build relationships, discuss biblical truths and encourage age-appropriate learning.\n\nGame and activity time: Movement and play help children build friendships and enjoy being part of the club.", "", "About", 1],
  ["pages", "getting-started", "Getting started", "Bring your church team together and take practical steps toward a children's discipleship club.", "Start with a conversation\n\nEvery church and community is different. Our team can help you understand the programme options and plan a launch that fits your context.\n\n1. Talk with your church leadership and ministry team.\n2. Identify volunteers and agree on safeguarding practices.\n3. Confirm the programme model and approved materials.\n4. Arrange leader orientation and training.\n5. Communicate with families and prepare for launch.", "", "Churches", 1],
  ["pages", "leadership", "Leadership and volunteers", "Caring, prepared leaders make a lasting difference in the lives of children.", "Serve together\n\nChurch teams may include a ministry director, small-group leaders, a games lead and other volunteers. Final roles depend on the local church structure.\n\nVolunteers should follow their church's child-protection policies, training requirements and approved supervision practices.", "", "Leaders", 1],
  ["pages", "leader-hub", "Leader Hub", "A starting point for ministry leaders looking for training, practical guidance and resources.", "Support for your ministry\n\nFind training, club planning guidance, approved resources and support for your church team.", "", "Leaders", 1],
  ["pages", "parents", "Parents and family", "Learn what to expect at club and find ways to encourage faith at home.", "Growing together, at club and at home\n\nAwana clubs partner with families and churches to encourage children in their spiritual growth. Contact your local club to ask about schedules, activities and its child-safety policies.", "", "Families", 1],
  ["pages", "resources", "Resource library", "Find approved information and learning resources for families, volunteers and church teams.", "Resources for your next step\n\nBrowse approved public resources. Restricted leader materials should only be shared with authorised users.", "", "Resources", 1],
  ["pages", "events", "Events and training", "Find information about leader training, workshops and ministry gatherings.", "Coming together to learn\n\nEvent details will be published here when dates and registration information are confirmed. Contact us to ask about upcoming training.", "", "Events", 1],
  ["pages", "churches", "Church finder", "Looking for an Awana club in your area? Get in touch and we will help with your enquiry.", "Find a participating church\n\nA directory can be published here when church listings and permission to publish contact information have been confirmed. Send us your region or locality and we will help with your enquiry.", "", "Churches", 1],
  ["pages", "products", "Products and materials", "Information about approved books and programme materials for churches and families.", "Materials information\n\nProduct details and purchase options will be listed here when approved information is available. The Phase 1 site does not process orders or payments.", "", "Products", 1],
  ["pages", "faqs", "FAQs and support", "Answers to common questions about programmes, churches, resources and volunteering.", "Frequently asked questions\n\nFind answers to common questions about Awana Clubs Ghana, or contact us for support.", "", "Support", 1],
  ["pages", "contact", "Contact Awana Ghana", "Have a question about starting a club, training or family resources? Send us a message.", "We would love to hear from you\n\nAccra, Ghana · hello@awana.org.gh", "", "Contact", 1],
  ["pages", "programmes/puggles", "Puggles", "An early childhood programme example for children ages 2–3.", "A joyful first experience\n\nPuggles introduces little ones to foundational Bible truths through age-appropriate stories, songs, play and caring interactions.\n\nProgramme availability and age ranges vary. Contact your local participating church to learn about its current offerings.", "", "Programmes", 1],
  ["pages", "programmes/cubbies", "Cubbies", "An early childhood programme example for children ages 3–5.", "Learning through wonder\n\nCubbies uses stories, music and activities to make biblical truths accessible to preschool children.\n\nProgramme availability and age ranges vary. Contact your local participating church to learn about its current offerings.", "", "Programmes", 1],
  ["pages", "programmes/sparks", "Sparks", "An elementary programme example for Kindergarten through Grade 2.", "Discovering the Bible together\n\nSparks combines Bible learning, memory work and activity to help children begin to understand and apply God's Word.\n\nProgramme availability and age ranges vary. Contact your local participating church to learn about its current offerings.", "", "Programmes", 1],
  ["pages", "programmes/tt", "T&T", "An elementary programme example for Grades 3–6.", "Growing in faith and understanding\n\nT&T encourages older elementary children to explore biblical truths and connect faith with everyday choices.\n\nProgramme availability and age ranges vary. Contact your local participating church to learn about its current offerings.", "", "Programmes", 1],
  ["programmes", "puggles", "Puggles", "Play, worship and simple biblical truths for our youngest learners.", "Early childhood · Ages 2–3", "", "Early childhood", 1],
  ["programmes", "cubbies", "Cubbies", "Hands-on Bible learning that builds a strong foundation of faith.", "Early childhood · Ages 3–5", "", "Early childhood", 2],
  ["programmes", "sparks", "Sparks", "High-energy activities and Scripture that help children discover who God is.", "Kindergarten–Grade 2", "", "Elementary", 3],
  ["programmes", "tt", "T&T", "Deepening biblical understanding and encouraging everyday discipleship.", "Grades 3–6", "", "Elementary", 4],
  ["programmes", "trek", "Trek", "Resources and guidance for middle-school discipleship.", "Grades 6–8", "", "Middle school", 5],
  ["programmes", "journey", "Journey", "Resources and guidance for high-school discipleship.", "Grades 9–12", "", "High school", 6],
  ["faqs", "what-is-awana", "What is Awana?", "Awana partners with churches to support the discipleship of children and young people.", "General", "", "General", 1],
  ["faqs", "starting-a-club", "How can my church get started?", "Begin by speaking with your church leadership and contacting our team for guidance.", "Churches", "", "Churches", 2],
  ["faqs", "find-a-club", "How can I find a club?", "Send us your region or locality through the contact form and we will help with your enquiry.", "Programmes", "", "Programmes", 3],
  ["faqs", "volunteer", "How can I volunteer?", "Contact a participating church to ask about its volunteer roles, training and safeguarding requirements.", "Volunteering", "", "Volunteering", 4],
  ["faqs", "resources", "Are resources available to download?", "Approved public resources will be listed in the resource library. Some resources may be restricted to authorised leaders.", "Resources", "", "Resources", 5],
  ["resources", "start-club-guide", "Starting a Club", "Planning steps for churches exploring an Awana club.", "Guide", "", "Churches", 1],
  ["resources", "leader-development", "Leader Development", "Training and ministry guidance for volunteers.", "Training", "", "Leaders", 2],
  ["resources", "parent-resources", "Parent Resources", "Information for families about club and discipleship.", "Family", "", "Families", 3]
];

const insertCmsItem = db.prepare(`INSERT OR IGNORE INTO cms_items
  (type, slug, title, summary, body, image_url, category, published, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const seedCms = db.transaction(() => {
  for (const [type, slug, title, summary, body, imageUrl, category, order] of defaultCmsItems) {
    insertCmsItem.run(type, slug, title, summary, body, imageUrl, category, 1, order);
  }
});
seedCms();

const defaultSettings = {
  "brand.tagline": "Building faith. Inspiring purpose. Transforming generations.",
  "brand.logo": "/logo.png",
  "nav.about.label": "About",
  "nav.about.href": "/about",
  "nav.programmes.label": "Programmes",
  "nav.programmes.href": "/programmes",
  "nav.how.label": "How it works",
  "nav.how.href": "/how-it-works",
  "nav.leaders.label": "For Leaders",
  "nav.leaders.href": "/leadership",
  "nav.families.label": "For Families",
  "nav.families.href": "/parents",
  "nav.resources.label": "Resources",
  "nav.resources.href": "/resources",
  "nav.events.label": "Events",
  "nav.events.href": "/events",
  "nav.cta.label": "Get involved",
  "nav.cta.href": "/getting-started",
  "contact.email": "hello@awana.org.gh",
  "contact.location": "Accra, Ghana",
  "home.hero.kicker": "Discipleship for every generation",
  "home.hero.title": "Helping children discover their place in |God's story.",
  "home.hero.description": "Fun, faith-filled clubs that equip young people to know, love and serve Jesus for a lifetime.",
  "home.hero.primary_label": "Find a club",
  "home.hero.primary_href": "/churches",
  "home.hero.secondary_label": "Explore programmes",
  "home.hero.secondary_href": "/programmes",
  "home.hero.image": "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=900&q=85",
  "home.impact.value": "42+",
  "home.impact.label": "churches growing together",
  "home.about.kicker": "Welcome to Awana Ghana",
  "home.about.title": "Where every child belongs and |can grow.",
  "home.about.description": "We partner with churches across Ghana to help children and teens come to know Jesus, grow in their faith, and become lifelong disciples.",
  "home.about.image": "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1000&q=85",
  "home.about.value1.title": "Know",
  "home.about.value1.body": "God's Word",
  "home.about.value2.title": "Love",
  "home.about.value2.body": "His truth",
  "home.about.value3.title": "Serve",
  "home.about.value3.body": "His world",
  "home.programmes.kicker": "Our programmes",
  "home.programmes.title": "Every stage. |Every possibility.",
  "home.programmes.description": "Awana meets children where they are, with age-appropriate programmes that turn truth into a lifelong journey.",
  "home.leaders.kicker": "Leader support",
  "home.leaders.title": "You're never alone in |the mission.",
  "home.leaders.description": "Find practical guidance, training and resources designed to help you lead confidently and disciple effectively.",
  "home.leaders.image": "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1000&q=85",
  "home.leaders.quote": "Come, let us grow together as we point children to Jesus.",
  "home.leaders.point1": "Leader training & workshops",
  "home.leaders.point2": "Curriculum and programme resources",
  "home.leaders.point3": "Ongoing church support",
  "home.resources.kicker": "Resource library",
  "home.resources.title": "Tools for a |stronger ministry.",
  "home.events.kicker": "What's happening",
  "home.events.title": "Upcoming |events.",
  "home.started.kicker": "Get started",
  "home.started.title": "Ready to bring Awana to |your church?",
  "home.started.description": "We would love to help you take the next step.",
  "home.families.kicker": "For families",
  "home.families.title": "Faith that |grows at home.",
  "home.families.description": "Discover simple ways to encourage your child's spiritual growth beyond club meetings.",
  "home.families.image": "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&w=900&q=85",
  "home.contact.kicker": "Contact us",
  "home.contact.title": "Let's start a |conversation.",
  "footer.description": "Equipping churches to disciple the next generation in Ghana.",
  "social.facebook": "",
  "social.instagram": "",
  "social.youtube": ""
};
const saveDefaultSetting = db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(defaultSettings)) saveDefaultSetting.run(key, value);

const adminCount = db.prepare("SELECT COUNT(*) count FROM users WHERE role = 'administrator'").get().count;
if (!adminCount) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the first administrator.");
  }
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run(
    "Awana Administrator", adminEmail, bcrypt.hashSync(adminPassword, 10), "administrator"
  );
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/register", (_req, res) => res.sendFile(path.join(__dirname, "public", "registration.html")));
app.get("/api/events", (_req, res) => {
  res.json(db.prepare("SELECT * FROM cms_items WHERE type = 'events' AND published = 1 ORDER BY event_date, sort_order, id LIMIT 6").all());
});
app.get("/api/faqs", (_req, res) => {
  res.json(db.prepare("SELECT * FROM cms_items WHERE type = 'faqs' AND published = 1 ORDER BY sort_order, id").all());
});
app.get("/api/site/content", (_req, res) => {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM site_settings").all().map(row => [row.key, row.value]));
  const items = db.prepare("SELECT * FROM cms_items WHERE published = 1 ORDER BY sort_order, id").all();
  res.json({ settings, items });
});
app.get("/api/site/page", (req, res) => {
  const slug = String(req.query.slug || "");
  const page = db.prepare("SELECT * FROM cms_items WHERE type IN ('pages', 'programmes') AND slug = ? AND published = 1 ORDER BY CASE type WHEN 'pages' THEN 0 ELSE 1 END LIMIT 1").get(slug);
  if (!page) return res.status(404).json({ error: "Page not found." });
  res.json(page);
});

app.get(/^\/(.+)$/, (req, res, next) => {
  const slug = req.params[0];
  if (slug.startsWith("api/")) return next();
  const page = db.prepare("SELECT id FROM cms_items WHERE type IN ('pages', 'programmes') AND slug = ? AND published = 1 LIMIT 1").get(slug);
  if (page) {
    return res.sendFile(path.join(__dirname, "public", "page.html"));
  }
  next();
});

app.post("/api/enquiries", (req, res) => {
  const { name, email, telephone = "", organisation = "", subject = "Website enquiry", message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: "Name, email and message are required." });
  db.prepare(`INSERT INTO enquiries (name, email, telephone, organisation, subject, message)
    VALUES (?, ?, ?, ?, ?, ?)`).run(name.trim(), email.trim(), telephone.trim(), organisation.trim(), subject.trim(), message.trim());
  res.status(201).json({ success: true });
});

app.post("/api/newsletter", (req, res) => {
  const { firstName = "", lastName = "", email, location = "", consent } = req.body;
  if (!email || consent !== true && consent !== "true") {
    return res.status(400).json({ error: "A valid email and consent are required." });
  }
  try {
    db.prepare(`INSERT INTO subscribers (first_name, last_name, email, location, consent)
      VALUES (?, ?, ?, ?, 1)`).run(firstName.trim(), lastName.trim(), email.trim(), location.trim());
  } catch (error) {
    if (String(error).includes("UNIQUE")) return res.status(409).json({ error: "This email is already subscribed." });
    throw error;
  }
  res.status(201).json({ success: true });
});

app.post("/api/registrations", (req, res, next) => {
  const uploadedFiles = () => Object.values(req.files || {}).flat();
  const discardUploadedFiles = () => {
    for (const file of uploadedFiles()) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  };
  registrationUpload.fields([{ name: "childPhotos", maxCount: 3 }, { name: "childIdentification", maxCount: 1 }])(req, res, error => {
    if (error) {
      discardUploadedFiles();
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Each photo and the identification file must be 5 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
          ? "Upload no more than 3 photos and 1 identification file."
          : error.message;
      return res.status(400).json({ error: message });
    }

    const body = req.body || {};
    const text = value => typeof value === "string" ? value.trim() : "";
    const childName = text(body.childName);
    const childDob = text(body.childDateOfBirth);
    const rank = text(body.rank);
    const clubName = text(body.clubName);
    const identificationType = text(body.childIdentificationType);
    const guardianName = text(body.guardianName);
    const guardianRelationship = text(body.guardianRelationship);
    const guardianPhone = text(body.guardianPhone);
    const guardianEmail = text(body.guardianEmail);
    const location = text(body.location);
    const validRanks = new Set(["Hiker", "Skipper", "Climber", "Dove", "Eagle", "Deer", "Lion", "JV"]);
    const validRelationships = new Set(["Parent", "Legal guardian", "Grandparent", "Other caregiver"]);
    const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(childDob) ? new Date(`${childDob}T00:00:00Z`) : null;
    const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) &&
      parsedDob.toISOString().slice(0, 10) === childDob &&
      childDob <= new Date().toISOString().slice(0, 10);
    const reject = message => {
      discardUploadedFiles();
      return res.status(400).json({ error: message });
    };

    if (!childName || !validDob || !validRanks.has(rank) || !clubName || !guardianName ||
        !validRelationships.has(guardianRelationship) || !guardianPhone || !location ||
        body.consent !== "true" && body.consent !== true) {
      return reject("Complete the required fields and confirm parent or guardian consent.");
    }
    if (childName.length > 160 || guardianName.length > 160 || guardianPhone.length > 30 ||
        guardianEmail.length > 254 || location.length > 160 || clubName.length > 200) {
      return reject("One or more fields exceed the allowed length.");
    }
    if (!/^[+()\d.\-\s]{7,30}$/.test(guardianPhone) || guardianPhone.replace(/\D/g, "").length < 7) {
      return reject("Enter a valid guardian phone number.");
    }
    if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
      return reject("Enter a valid guardian email address.");
    }

    const photos = req.files.childPhotos || [];
    const identification = (req.files.childIdentification || [])[0];
    const validIdentificationTypes = new Set(["Ghana Card", "Birth certificate", "Health insurance", "Other"]);
    if (identification && !validIdentificationTypes.has(identificationType)) {
      return reject("Choose the type of identification you uploaded.");
    }
    if (!identification && identificationType) {
      return reject("Upload the selected identification document or clear its type.");
    }
    if (photos.some(file => !hasValidImageSignature(file))) {
      return reject("One or more uploaded files are not valid image files.");
    }
    if (identification && !hasValidIdentificationSignature(identification)) {
      return reject("The identification file content does not match an allowed image or PDF format.");
    }

    try {
      db.prepare(`INSERT INTO registrations
        (child_name, child_dob, programme, guardian_name, guardian_relationship, guardian_phone, guardian_email, location, consent, rank, club_name, photos, identification_type, identification_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`).run(
        childName, childDob, rank, guardianName, guardianRelationship, guardianPhone, guardianEmail, location,
        rank, clubName, JSON.stringify(photos.map(file => file.filename)), identificationType, identification ? identification.filename : ""
      );
    } catch (insertError) {
      discardUploadedFiles();
      return next(insertError);
    }
    res.status(201).json({ success: true });
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password || "", user.password)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ success: true, user: req.session.user });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ success: true })));
app.get("/api/session", (req, res) => res.json({ user: req.session.user || null }));

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "administrator") {
    return res.status(401).json({ error: "Administrator access required." });
  }
  next();
}

const cmsTypes = new Set(["pages", "programmes", "events", "faqs", "resources", "products", "churches", "announcements"]);
const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);
const identificationTypes = new Map([
  ...imageTypes,
  ["application/pdf", ".pdf"]
]);
const resourceTypes = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"]
]);
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${imageTypes.get(file.mimetype)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = imageTypes.get(file.mimetype);
    const originalExtension = path.extname(file.originalname).toLowerCase();
    const validExtension = file.mimetype === "image/jpeg"
      ? [".jpg", ".jpeg"].includes(originalExtension)
      : originalExtension === extension;
    if (!extension || !validExtension) {
      return callback(new Error("Upload a JPG, PNG, GIF or WebP image."));
    }
    callback(null, true);
  }
});
const registrationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, callback) => callback(null, file.fieldname === "childIdentification" ? registrationIdentificationDir : registrationPhotoDir),
    filename: (_req, file, callback) => {
      const types = file.fieldname === "childIdentification" ? identificationTypes : imageTypes;
      callback(null, `${crypto.randomUUID()}${types.get(file.mimetype)}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 13, fieldSize: 16 * 1024 },
  fileFilter: (_req, file, callback) => {
    const types = file.fieldname === "childIdentification" ? identificationTypes : imageTypes;
    const extension = types.get(file.mimetype);
    const originalExtension = path.extname(file.originalname).toLowerCase();
    const validExtension = file.mimetype === "image/jpeg"
      ? [".jpg", ".jpeg"].includes(originalExtension)
      : originalExtension === extension;
    if (!extension || !validExtension) {
      return callback(new Error(file.fieldname === "childIdentification"
        ? "Upload a JPG, PNG, GIF, WebP or PDF identification file."
        : "Upload JPG, PNG, GIF or WebP photos only."));
    }
    callback(null, true);
  }
});
const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, resourceUploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${resourceTypes.get(file.mimetype)}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = resourceTypes.get(file.mimetype);
    if (!extension || path.extname(file.originalname).toLowerCase() !== extension) {
      return callback(new Error("Upload a PDF, DOC or DOCX resource file."));
    }
    callback(null, true);
  }
});

function hasValidImageSignature(file) {
  const descriptor = fs.openSync(file.path, "r");
  const header = Buffer.alloc(12);
  let bytesRead;
  try {
    bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (file.mimetype === "image/jpeg") return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (file.mimetype === "image/png") return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/gif") return ["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"));
  if (file.mimetype === "image/webp") return bytesRead >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function hasValidIdentificationSignature(file) {
  if (file.mimetype !== "application/pdf") return hasValidImageSignature(file);
  const descriptor = fs.openSync(file.path, "r");
  const header = Buffer.alloc(5);
  let bytesRead;
  try {
    bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return bytesRead === 5 && header.toString("ascii") === "%PDF-";
}

function isValidImageUrl(value) {
  if (!value) return true;
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch (_error) {
    return false;
  }
}

function isValidLinkUrl(value) {
  if (!value) return true;
  if (/^\/(?!\/)[a-zA-Z0-9_./?&=%#-]*$/.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch (_error) {
    return false;
  }
}

function normalizeCmsItem(input) {
  const type = String(input.type || "");
  const slug = String(input.slug || "").trim().toLowerCase();
  const title = String(input.title || "").trim();
  const imageUrl = String(input.image_url || "").trim();
  const linkUrl = String(input.link_url || "").trim();
  if (!cmsTypes.has(type)) throw new Error("Choose a valid content type.");
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(slug)) throw new Error("Use a URL-safe slug with lowercase letters, numbers, hyphens or slashes.");
  if (type === "programmes" && slug.includes("/")) throw new Error("Programme slugs must be a single URL segment.");
  if (!title || title.length > 200) throw new Error("A title is required (maximum 200 characters).");
  if (!isValidImageUrl(imageUrl)) throw new Error("Use a valid HTTP(S) image URL or an uploaded image path.");
  if (!isValidLinkUrl(linkUrl)) throw new Error("Use a valid relative, HTTP or HTTPS link.");
  const published = input.published === false || input.published === 0 || input.published === "0" ? 0 : 1;
  const sortOrder = Number.parseInt(input.sort_order, 10);
  return {
    type,
    slug,
    title,
    summary: String(input.summary || "").trim().slice(0, 2000),
    body: String(input.body || "").trim().slice(0, 30000),
    image_url: imageUrl,
    category: String(input.category || "").trim().slice(0, 100),
    event_date: String(input.event_date || "").trim().slice(0, 30),
    event_time: String(input.event_time || "").trim().slice(0, 100),
    venue: String(input.venue || "").trim().slice(0, 300),
    link_url: linkUrl.slice(0, 2000),
    published,
    sort_order: Number.isFinite(sortOrder) ? Math.min(Math.max(sortOrder, 0), 100000) : 0
  };
}

app.get("/api/admin/content", requireAdmin, (req, res) => {
  const type = String(req.query.type || "");
  if (type && !cmsTypes.has(type)) return res.status(400).json({ error: "Invalid content type." });
  const items = type
    ? db.prepare("SELECT * FROM cms_items WHERE type = ? ORDER BY sort_order, updated_at DESC, id DESC").all(type)
    : db.prepare("SELECT * FROM cms_items ORDER BY type, sort_order, updated_at DESC, id DESC").all();
  res.json(items);
});

app.post("/api/admin/content", requireAdmin, (req, res) => {
  let item;
  try {
    item = normalizeCmsItem(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = db.prepare(`INSERT INTO cms_items
      (type, slug, title, summary, body, image_url, category, event_date, event_time, venue, link_url, published, sort_order, updated_at)
      VALUES (@type, @slug, @title, @summary, @body, @image_url, @category, @event_date, @event_time, @venue, @link_url, @published, @sort_order, CURRENT_TIMESTAMP)`).run(item);
    res.status(201).json(db.prepare("SELECT * FROM cms_items WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) return res.status(409).json({ error: "That slug is already in use for this content type." });
    throw error;
  }
});

app.put("/api/admin/content/:id", requireAdmin, (req, res) => {
  let item;
  try {
    item = normalizeCmsItem(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = db.prepare(`UPDATE cms_items SET type = @type, slug = @slug, title = @title, summary = @summary,
      body = @body, image_url = @image_url, category = @category, event_date = @event_date, event_time = @event_time,
      venue = @venue, link_url = @link_url, published = @published, sort_order = @sort_order,
      updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...item, id: req.params.id });
    if (!result.changes) return res.status(404).json({ error: "Content item not found." });
    res.json(db.prepare("SELECT * FROM cms_items WHERE id = ?").get(req.params.id));
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) return res.status(409).json({ error: "That slug is already in use for this content type." });
    throw error;
  }
});

app.delete("/api/admin/files/:filename", requireAdmin, (req, res) => {
  const filename = req.params.filename;
  if (!/^[0-9a-f-]{36}\.(pdf|docx?)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid resource filename." });
  }
  const url = `/uploads/resources/${filename}`;
  if (db.prepare("SELECT id FROM cms_items WHERE link_url = ? LIMIT 1").get(url)) {
    return res.status(409).json({ error: "This file is attached to a resource. Remove the attachment before deleting it." });
  }
  const filepath = path.join(resourceUploadDir, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: "Resource file not found." });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

app.delete("/api/admin/content/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM cms_items WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Content item not found." });
  res.json({ success: true });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json(Object.fromEntries(db.prepare("SELECT key, value FROM site_settings").all().map(row => [row.key, row.value])));
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const updates = req.body;
  if (!updates || Array.isArray(updates) || typeof updates !== "object") {
    return res.status(400).json({ error: "Provide a settings object." });
  }
  const entries = Object.entries(updates);
  if (entries.length > 100) return res.status(400).json({ error: "Too many settings in one request." });
  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
      return res.status(400).json({ error: `Unknown setting: ${key}` });
    }
    if (typeof value !== "string" || value.length > 2000) {
      return res.status(400).json({ error: `Invalid value for ${key}.` });
    }
    if ((key.endsWith(".image") || key === "brand.logo") && !isValidImageUrl(value.trim())) {
      return res.status(400).json({ error: `Use a valid HTTP(S) image URL or uploaded image path for ${key}.` });
    }
    if (key.startsWith("social.") && value.trim() && !isValidLinkUrl(value.trim())) {
      return res.status(400).json({ error: `Use a valid website URL for ${key}.` });
    }
    if (key.startsWith("nav.") && key.endsWith(".href") && !isValidLinkUrl(value.trim())) {
      return res.status(400).json({ error: `Use a valid relative, HTTP or HTTPS link for ${key}.` });
    }
    if (key === "contact.email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return res.status(400).json({ error: "Enter a valid contact email address." });
    }
  }
  const saveSetting = db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const saveSettings = db.transaction(() => {
    for (const [key, value] of entries) saveSetting.run(key, value.trim());
  });
  saveSettings();
  res.json({ success: true, settings: Object.fromEntries(db.prepare("SELECT key, value FROM site_settings").all().map(row => [row.key, row.value])) });
});

app.get("/api/admin/media", requireAdmin, (_req, res) => {
  const media = fs.readdirSync(uploadDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(entry.name))
    .map(entry => ({ filename: entry.name, url: `/uploads/${entry.name}` }));
  res.json(media);
});

app.post("/api/admin/media", requireAdmin, (req, res) => {
  imageUpload.single("image")(req, res, error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
    const header = Buffer.alloc(12);
    const fd = fs.openSync(req.file.path, "r");
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    fs.closeSync(fd);
    const magic = header.subarray(0, bytesRead);
    const valid = req.file.mimetype === "image/jpeg" ? magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff
      : req.file.mimetype === "image/png" ? magic.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : req.file.mimetype === "image/gif" ? magic.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null
          : req.file.mimetype === "image/webp" ? magic.subarray(0, 4).toString("ascii") === "RIFF" && magic.subarray(8, 12).toString("ascii") === "WEBP"
            : false;
    if (!valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "The uploaded file content does not match an allowed image format." });
    }
    res.status(201).json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
  });
});

app.get("/api/admin/files", requireAdmin, (_req, res) => {
  const files = fs.readdirSync(resourceUploadDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(pdf|docx?)$/i.test(entry.name))
    .map(entry => ({ filename: entry.name, url: `/uploads/resources/${entry.name}` }));
  res.json(files);
});

app.post("/api/admin/files", requireAdmin, (req, res) => {
  resourceUpload.single("file")(req, res, error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Resource files must be 20 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a resource file to upload." });
    const header = Buffer.alloc(8);
    const fd = fs.openSync(req.file.path, "r");
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    fs.closeSync(fd);
    const signature = header.subarray(0, bytesRead);
    const valid = req.file.mimetype === "application/pdf"
      ? signature.subarray(0, 5).toString("ascii") === "%PDF-"
      : req.file.mimetype === "application/msword"
        ? signature.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
        : req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04
          : false;
    if (!valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "The uploaded file content does not match its document format." });
    }
    res.status(201).json({ filename: req.file.filename, url: `/uploads/resources/${req.file.filename}` });
  });
});

app.delete("/api/admin/media/:filename", requireAdmin, (req, res) => {
  const filename = req.params.filename;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid media filename." });
  }
  const url = `/uploads/${filename}`;
  const itemUse = db.prepare("SELECT id FROM cms_items WHERE image_url = ? OR link_url = ? LIMIT 1").get(url, url);
  const settingUse = db.prepare("SELECT key FROM site_settings WHERE value = ? LIMIT 1").get(url);
  if (itemUse || settingUse) return res.status(409).json({ error: "This image is in use. Remove it from its content before deleting it." });
  const filepath = path.join(uploadDir, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: "Image not found." });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  res.json({
    enquiries: db.prepare("SELECT COUNT(*) count FROM enquiries").get().count,
    registrations: db.prepare("SELECT COUNT(*) count FROM registrations").get().count,
    subscribers: db.prepare("SELECT COUNT(*) count FROM subscribers").get().count,
    events: db.prepare("SELECT COUNT(*) count FROM cms_items WHERE type = 'events' AND published = 1").get().count,
    faqs: db.prepare("SELECT COUNT(*) count FROM cms_items WHERE type = 'faqs' AND published = 1").get().count,
    recent: db.prepare("SELECT id, name, email, subject, status, created_at FROM enquiries ORDER BY id DESC LIMIT 8").all()
  });
});

app.get("/api/admin/registrations", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM registrations ORDER BY id DESC").all());
});

app.get("/api/admin/registrations/:id/photos/:filename", requireAdmin, (req, res) => {
  const { id, filename } = req.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid photo filename." });
  }
  const registration = db.prepare("SELECT photos FROM registrations WHERE id = ?").get(id);
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  const photos = JSON.parse(registration.photos || "[]");
  if (!Array.isArray(photos) || !photos.includes(filename)) {
    return res.status(404).json({ error: "Photo not found." });
  }
  const photoPath = path.join(registrationPhotoDir, filename);
  if (!fs.existsSync(photoPath)) return res.status(404).json({ error: "Photo not found." });
  res.type(path.extname(filename));
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(photoPath);
});

app.get("/api/admin/registrations/:id/identification/:filename", requireAdmin, (req, res) => {
  const { id, filename } = req.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid identification filename." });
  }
  const registration = db.prepare("SELECT identification_file FROM registrations WHERE id = ?").get(id);
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  if (registration.identification_file !== filename) {
    return res.status(404).json({ error: "Identification document not found." });
  }
  const identificationPath = path.join(registrationIdentificationDir, filename);
  if (!fs.existsSync(identificationPath)) return res.status(404).json({ error: "Identification document not found." });
  res.type(path.extname(filename));
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(identificationPath);
});

app.delete("/api/admin/registrations/:id", requireAdmin, (req, res) => {
  const registration = db.prepare("SELECT photos, identification_file FROM registrations WHERE id = ?").get(req.params.id);
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  const photos = JSON.parse(registration.photos || "[]");
  if (Array.isArray(photos)) {
    for (const filename of photos) {
      if (typeof filename === "string" && /^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)) {
        const photoPath = path.join(registrationPhotoDir, filename);
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
      }
    }
    if (typeof registration.identification_file === "string" &&
        /^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(registration.identification_file)) {
      const identificationPath = path.join(registrationIdentificationDir, registration.identification_file);
      if (fs.existsSync(identificationPath)) fs.unlinkSync(identificationPath);
    }
  }
  const result = db.prepare("DELETE FROM registrations WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Registration not found." });
  res.json({ success: true });
});

app.get("/api/admin/enquiries", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM enquiries ORDER BY id DESC").all());
});

app.delete("/api/admin/enquiries/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM enquiries WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Enquiry not found." });
  res.json({ success: true });
});

app.get("/api/admin/subscribers", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM subscribers ORDER BY id DESC").all());
});

app.delete("/api/admin/subscribers/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM subscribers WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Subscriber not found." });
  res.json({ success: true });
});

app.patch("/api/admin/enquiries/:id", requireAdmin, (req, res) => {
  const status = req.body.status;
  if (!["New", "In Progress", "Responded", "Closed"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  db.prepare("UPDATE enquiries SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ success: true });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Awana Clubs Ghana is running at http://localhost:${port}`);
});
