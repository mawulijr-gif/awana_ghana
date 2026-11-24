const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sessionSecret) {
  throw new Error("Set SESSION_SECRET before starting the server.");
}
if (!databaseUrl) {
  throw new Error("Set DATABASE_URL to your Supabase PostgreSQL connection string before starting the server.");
}
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the server.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const siteAssets = supabase.storage.from("site-assets");
const registrationAssets = supabase.storage.from("registration-files");
const db = new Pool({ connectionString: databaseUrl, max: 10 });
db.on("error", error => console.error("Supabase database connection error:", error));

async function uploadStorageFile(bucket, filename, file) {
  const { error } = await bucket.upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;
}

async function removeStorageFiles(bucket, filenames) {
  if (!filenames.length) return;
  const { error } = await bucket.remove(filenames);
  if (error) throw error;
}

function publicAssetUrl(filename) {
  return siteAssets.getPublicUrl(filename).data.publicUrl;
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

async function withTransaction(operation) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  await db.query("SELECT 1");
  await withTransaction(async client => {
    for (const [type, slug, title, summary, body, imageUrl, category, order] of defaultCmsItems) {
      await client.query(`INSERT INTO cms_items
        (type, slug, title, summary, body, image_url, category, published, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
        ON CONFLICT (type, slug) DO NOTHING`,
      [type, slug, title, summary, body, imageUrl, category, order]);
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
      await client.query("INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [key, value]);
    }

    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'administrator'");
    if (!rows[0].count) {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword || adminPassword.length < 12) {
        throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the first administrator.");
      }
      await client.query("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)",
        ["Awana Administrator", adminEmail, bcrypt.hashSync(adminPassword, 10), "administrator"]);
    }
  });
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/register", (_req, res) => res.sendFile(path.join(__dirname, "public", "registration.html")));
app.get("/api/events", async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM cms_items WHERE type = 'events' AND published = 1 ORDER BY event_date, sort_order, id LIMIT 6");
  res.json(rows);
});
app.get("/api/faqs", async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM cms_items WHERE type = 'faqs' AND published = 1 ORDER BY sort_order, id");
  res.json(rows);
});
app.get("/api/site/content", async (_req, res) => {
  const [settingsResult, itemsResult] = await Promise.all([
    db.query("SELECT key, value FROM site_settings"),
    db.query("SELECT * FROM cms_items WHERE published = 1 ORDER BY sort_order, id")
  ]);
  const settings = Object.fromEntries(settingsResult.rows.map(row => [row.key, row.value]));
  const items = itemsResult.rows;
  res.json({ settings, items });
});
app.get("/api/site/page", async (req, res) => {
  const slug = String(req.query.slug || "");
  const { rows } = await db.query(`SELECT * FROM cms_items
    WHERE type IN ('pages', 'programmes') AND slug = $1 AND published = 1
    ORDER BY CASE type WHEN 'pages' THEN 0 ELSE 1 END LIMIT 1`, [slug]);
  const page = rows[0];
  if (!page) return res.status(404).json({ error: "Page not found." });
  res.json(page);
});

app.get(/^\/(.+)$/, async (req, res, next) => {
  const slug = req.params[0];
  if (slug.startsWith("api/")) return next();
  const { rows } = await db.query("SELECT id FROM cms_items WHERE type IN ('pages', 'programmes') AND slug = $1 AND published = 1 LIMIT 1", [slug]);
  const page = rows[0];
  if (page) {
    return res.sendFile(path.join(__dirname, "public", "page.html"));
  }
  next();
});

app.post("/api/enquiries", async (req, res) => {
  const { name, email, telephone = "", organisation = "", subject = "Website enquiry", message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: "Name, email and message are required." });
  await db.query(`INSERT INTO enquiries (name, email, telephone, organisation, subject, message)
    VALUES ($1, $2, $3, $4, $5, $6)`,
  [name.trim(), email.trim(), telephone.trim(), organisation.trim(), subject.trim(), message.trim()]);
  res.status(201).json({ success: true });
});

app.post("/api/newsletter", async (req, res) => {
  const { firstName = "", lastName = "", email, location = "", consent } = req.body;
  if (!email || consent !== true && consent !== "true") {
    return res.status(400).json({ error: "A valid email and consent are required." });
  }
  try {
    await db.query(`INSERT INTO subscribers (first_name, last_name, email, location, consent)
      VALUES ($1, $2, $3, $4, 1)`, [firstName.trim(), lastName.trim(), email.trim(), location.trim()]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "This email is already subscribed." });
    throw error;
  }
  res.status(201).json({ success: true });
});

app.post("/api/registrations", (req, res, next) => {
  registrationUpload.fields([{ name: "childPhotos", maxCount: 3 }, { name: "childIdentification", maxCount: 1 }])(req, res, async error => {
    if (error) {
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
    const reject = message => res.status(400).json({ error: message });

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

    const photoNames = photos.map(file => `${crypto.randomUUID()}${imageTypes.get(file.mimetype)}`);
    const identificationName = identification
      ? `${crypto.randomUUID()}${identificationTypes.get(identification.mimetype)}`
      : "";
    const uploadedNames = [];
    try {
      for (let index = 0; index < photos.length; index += 1) {
        await uploadStorageFile(registrationAssets, photoNames[index], photos[index]);
        uploadedNames.push(photoNames[index]);
      }
      if (identification) {
        await uploadStorageFile(registrationAssets, identificationName, identification);
        uploadedNames.push(identificationName);
      }
      await db.query(`INSERT INTO registrations
        (child_name, child_dob, programme, guardian_name, guardian_relationship, guardian_phone, guardian_email, location, consent, rank, club_name, photos, identification_type, identification_file)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, $12, $13)`,
      [
        childName, childDob, rank, guardianName, guardianRelationship, guardianPhone, guardianEmail, location,
        rank, clubName, JSON.stringify(photoNames), identificationType, identificationName
      ]);
    } catch (registrationError) {
      try {
        await removeStorageFiles(registrationAssets, uploadedNames);
      } catch (cleanupError) {
        console.error("Could not clean up registration uploads after a failed registration:", cleanupError);
      }
      return next(registrationError);
    }
    res.status(201).json({ success: true });
  });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
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
const memoryStorage = multer.memoryStorage();
const imageUpload = multer({
  storage: memoryStorage,
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
  storage: memoryStorage,
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
  storage: memoryStorage,
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
  const header = file.buffer.subarray(0, 12);
  if (file.mimetype === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (file.mimetype === "image/png") return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/gif") return ["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"));
  if (file.mimetype === "image/webp") return header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function hasValidIdentificationSignature(file) {
  if (file.mimetype !== "application/pdf") return hasValidImageSignature(file);
  return file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function hasValidResourceSignature(file) {
  const header = file.buffer.subarray(0, 8);
  if (file.mimetype === "application/pdf") return header.subarray(0, 5).toString("ascii") === "%PDF-";
  if (file.mimetype === "application/msword") {
    return header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }
  return false;
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

app.get("/api/admin/content", requireAdmin, async (req, res) => {
  const type = String(req.query.type || "");
  if (type && !cmsTypes.has(type)) return res.status(400).json({ error: "Invalid content type." });
  const result = type
    ? await db.query("SELECT * FROM cms_items WHERE type = $1 ORDER BY sort_order, updated_at DESC, id DESC", [type])
    : await db.query("SELECT * FROM cms_items ORDER BY type, sort_order, updated_at DESC, id DESC");
  res.json(result.rows);
});

app.post("/api/admin/content", requireAdmin, async (req, res) => {
  let item;
  try {
    item = normalizeCmsItem(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = await db.query(`INSERT INTO cms_items
      (type, slug, title, summary, body, image_url, category, event_date, event_time, venue, link_url, published, sort_order, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      RETURNING *`, [
      item.type, item.slug, item.title, item.summary, item.body, item.image_url, item.category,
      item.event_date, item.event_time, item.venue, item.link_url, item.published, item.sort_order
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use for this content type." });
    throw error;
  }
});

app.put("/api/admin/content/:id", requireAdmin, async (req, res) => {
  let item;
  try {
    item = normalizeCmsItem(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = await db.query(`UPDATE cms_items SET type = $1, slug = $2, title = $3, summary = $4,
      body = $5, image_url = $6, category = $7, event_date = $8, event_time = $9,
      venue = $10, link_url = $11, published = $12, sort_order = $13,
      updated_at = CURRENT_TIMESTAMP WHERE id = $14 RETURNING *`, [
      item.type, item.slug, item.title, item.summary, item.body, item.image_url, item.category,
      item.event_date, item.event_time, item.venue, item.link_url, item.published, item.sort_order, req.params.id
    ]);
    if (!result.rowCount) return res.status(404).json({ error: "Content item not found." });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That slug is already in use for this content type." });
    throw error;
  }
});

app.delete("/api/admin/files/:filename", requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!/^[0-9a-f-]{36}\.(pdf|docx?)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid resource filename." });
  }
  const assetPath = `resources/${filename}`;
  const legacyUrl = `/uploads/resources/${filename}`;
  const url = publicAssetUrl(assetPath);
  const { rows } = await db.query("SELECT id FROM cms_items WHERE link_url = $1 OR link_url = $2 LIMIT 1", [url, legacyUrl]);
  if (rows[0]) {
    return res.status(409).json({ error: "This file is attached to a resource. Remove the attachment before deleting it." });
  }
  const { data: files, error } = await siteAssets.list("resources", { limit: 1000, search: filename });
  if (error) throw error;
  if (!files.some(file => file.id && file.name === filename)) {
    return res.status(404).json({ error: "Resource file not found." });
  }
  await removeStorageFiles(siteAssets, [assetPath]);
  res.json({ success: true });
});

app.delete("/api/admin/content/:id", requireAdmin, async (req, res) => {
  const result = await db.query("DELETE FROM cms_items WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Content item not found." });
  res.json({ success: true });
});

app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
  const { rows } = await db.query("SELECT key, value FROM site_settings");
  res.json(Object.fromEntries(rows.map(row => [row.key, row.value])));
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
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
  await withTransaction(async client => {
    for (const [key, value] of entries) {
      await client.query(`INSERT INTO site_settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value.trim()]);
    }
  });
  const { rows } = await db.query("SELECT key, value FROM site_settings");
  res.json({ success: true, settings: Object.fromEntries(rows.map(row => [row.key, row.value])) });
});

app.get("/api/admin/media", requireAdmin, async (_req, res) => {
  const { data: files, error } = await siteAssets.list("", { limit: 1000 });
  if (error) throw error;
  const media = files
    .filter(file => file.id && /\.(jpe?g|png|gif|webp)$/i.test(file.name))
    .map(file => ({ filename: file.name, url: publicAssetUrl(file.name) }));
  res.json(media);
});

app.post("/api/admin/media", requireAdmin, (req, res, next) => {
  imageUpload.single("image")(req, res, error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
    if (!hasValidImageSignature(req.file)) {
      return res.status(400).json({ error: "The uploaded file content does not match an allowed image format." });
    }
    const filename = `${crypto.randomUUID()}${imageTypes.get(req.file.mimetype)}`;
    uploadStorageFile(siteAssets, filename, req.file)
      .then(() => res.status(201).json({ filename, url: publicAssetUrl(filename) }))
      .catch(next);
  });
});

app.get("/api/admin/files", requireAdmin, async (_req, res) => {
  const { data: files, error } = await siteAssets.list("resources", { limit: 1000 });
  if (error) throw error;
  res.json(files
    .filter(file => file.id && /\.(pdf|docx?)$/i.test(file.name))
    .map(file => ({ filename: file.name, url: publicAssetUrl(`resources/${file.name}`) })));
});

app.post("/api/admin/files", requireAdmin, (req, res, next) => {
  resourceUpload.single("file")(req, res, error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Resource files must be 20 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a resource file to upload." });
    if (!hasValidResourceSignature(req.file)) {
      return res.status(400).json({ error: "The uploaded file content does not match its document format." });
    }
    const assetPath = `resources/${crypto.randomUUID()}${resourceTypes.get(req.file.mimetype)}`;
    uploadStorageFile(siteAssets, assetPath, req.file)
      .then(() => res.status(201).json({ filename: path.basename(assetPath), url: publicAssetUrl(assetPath) }))
      .catch(next);
  });
});

app.delete("/api/admin/media/:filename", requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid media filename." });
  }
  const url = publicAssetUrl(filename);
  const legacyUrl = `/uploads/${filename}`;
  const [itemUse, settingUse] = await Promise.all([
    db.query("SELECT id FROM cms_items WHERE image_url IN ($1, $2) OR link_url IN ($1, $2) LIMIT 1", [url, legacyUrl]),
    db.query("SELECT key FROM site_settings WHERE value IN ($1, $2) LIMIT 1", [url, legacyUrl])
  ]);
  if (itemUse.rows[0] || settingUse.rows[0]) return res.status(409).json({ error: "This image is in use. Remove it from its content before deleting it." });
  const { data: files, error } = await siteAssets.list("", { limit: 1000, search: filename });
  if (error) throw error;
  if (!files.some(file => file.id && file.name === filename)) {
    return res.status(404).json({ error: "Image not found." });
  }
  await removeStorageFiles(siteAssets, [filename]);
  res.json({ success: true });
});

app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  const [enquiries, registrations, subscribers, events, faqs, recent] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM enquiries"),
    db.query("SELECT COUNT(*)::int AS count FROM registrations"),
    db.query("SELECT COUNT(*)::int AS count FROM subscribers"),
    db.query("SELECT COUNT(*)::int AS count FROM cms_items WHERE type = 'events' AND published = 1"),
    db.query("SELECT COUNT(*)::int AS count FROM cms_items WHERE type = 'faqs' AND published = 1"),
    db.query("SELECT id, name, email, subject, status, created_at FROM enquiries ORDER BY id DESC LIMIT 8")
  ]);
  res.json({
    enquiries: enquiries.rows[0].count,
    registrations: registrations.rows[0].count,
    subscribers: subscribers.rows[0].count,
    events: events.rows[0].count,
    faqs: faqs.rows[0].count,
    recent: recent.rows
  });
});

app.get("/api/admin/registrations", requireAdmin, async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM registrations ORDER BY id DESC");
  res.json(rows);
});

app.get("/api/admin/registrations/:id/photos/:filename", requireAdmin, async (req, res) => {
  const { id, filename } = req.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid photo filename." });
  }
  const { rows } = await db.query("SELECT photos FROM registrations WHERE id = $1", [id]);
  const registration = rows[0];
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  const photos = JSON.parse(registration.photos || "[]");
  if (!Array.isArray(photos) || !photos.includes(filename)) {
    return res.status(404).json({ error: "Photo not found." });
  }
  const { data, error } = await registrationAssets.download(filename);
  if (error) {
    if (String(error.statusCode) === "404") return res.status(404).json({ error: "Photo not found." });
    throw error;
  }
  res.type(path.extname(filename));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(await data.arrayBuffer()));
});

app.get("/api/admin/registrations/:id/identification/:filename", requireAdmin, async (req, res) => {
  const { id, filename } = req.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename) || path.basename(filename) !== filename) {
    return res.status(400).json({ error: "Invalid identification filename." });
  }
  const { rows } = await db.query("SELECT identification_file FROM registrations WHERE id = $1", [id]);
  const registration = rows[0];
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  if (registration.identification_file !== filename) {
    return res.status(404).json({ error: "Identification document not found." });
  }
  const { data, error } = await registrationAssets.download(filename);
  if (error) {
    if (String(error.statusCode) === "404") return res.status(404).json({ error: "Identification document not found." });
    throw error;
  }
  res.type(path.extname(filename));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(await data.arrayBuffer()));
});

app.delete("/api/admin/registrations/:id", requireAdmin, async (req, res) => {
  const { rows } = await db.query("SELECT photos, identification_file FROM registrations WHERE id = $1", [req.params.id]);
  const registration = rows[0];
  if (!registration) return res.status(404).json({ error: "Registration not found." });
  const photos = JSON.parse(registration.photos || "[]");
  const storedFiles = Array.isArray(photos)
    ? photos.filter(filename => typeof filename === "string" && /^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename))
    : [];
  if (typeof registration.identification_file === "string" &&
      /^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(registration.identification_file)) {
    storedFiles.push(registration.identification_file);
  }
  await removeStorageFiles(registrationAssets, storedFiles);
  const result = await db.query("DELETE FROM registrations WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Registration not found." });
  res.json({ success: true });
});

app.get("/api/admin/enquiries", requireAdmin, async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM enquiries ORDER BY id DESC");
  res.json(rows);
});

app.delete("/api/admin/enquiries/:id", requireAdmin, async (req, res) => {
  const result = await db.query("DELETE FROM enquiries WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Enquiry not found." });
  res.json({ success: true });
});

app.get("/api/admin/subscribers", requireAdmin, async (_req, res) => {
  const { rows } = await db.query("SELECT * FROM subscribers ORDER BY id DESC");
  res.json(rows);
});

app.delete("/api/admin/subscribers/:id", requireAdmin, async (req, res) => {
  const result = await db.query("DELETE FROM subscribers WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Subscriber not found." });
  res.json({ success: true });
});

app.patch("/api/admin/enquiries/:id", requireAdmin, async (req, res) => {
  const status = req.body.status;
  if (!["New", "In Progress", "Responded", "Closed"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  await db.query("UPDATE enquiries SET status = $1 WHERE id = $2", [status, req.params.id]);
  res.json({ success: true });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  res.status(500).json({ error: "Something went wrong." });
});

initializeDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Awana Clubs Ghana is running at http://localhost:${port}`);
    });
  })
  .catch(error => {
    console.error("Could not initialize Supabase database:", error);
    db.end().finally(() => { process.exitCode = 1; });
  });
