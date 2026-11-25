const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const { validateRegistrationIdentification } = require("./lib/registration-identification");
const { createOneTimeToken, hashOneTimeToken, normalizeEmail } = require("./lib/leader-security");

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

    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin' AND is_active");
    if (!rows[0].count) {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword || adminPassword.length < 12) {
        throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the first administrator.");
      }
      await client.query(`INSERT INTO users (name, email, password, role, is_active)
        VALUES ($1, $2, $3, 'super_admin', true)
        ON CONFLICT (email) DO NOTHING`,
      ["Awana Super Admin", normalizeEmail(adminEmail), bcrypt.hashSync(adminPassword, 12)]);
      const { rows: admins } = await client.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin' AND is_active"
      );
      if (!admins[0].count) {
        throw new Error("ADMIN_EMAIL already belongs to a non-Super Admin account. Set ADMIN_EMAIL to a new address and restart.");
      }
    }
  });
}

class PostgresSessionStore extends session.Store {
  get(sid, callback) {
    db.query("SELECT sess FROM web_sessions WHERE sid = $1 AND expire > CURRENT_TIMESTAMP", [sid])
      .then(({ rows }) => callback(null, rows[0] ? rows[0].sess : null))
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    const expiresAt = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    db.query(`INSERT INTO web_sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
    [sid, JSON.stringify(sessionData), expiresAt])
      .then(() => callback && callback(null))
      .catch(error => callback && callback(error));
  }

  touch(sid, sessionData, callback) {
    const expiresAt = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    db.query("UPDATE web_sessions SET expire = $2 WHERE sid = $1", [sid, expiresAt])
      .then(() => callback && callback(null))
      .catch(error => callback && callback(error));
  }

  destroy(sid, callback) {
    db.query("DELETE FROM web_sessions WHERE sid = $1", [sid])
      .then(() => callback && callback(null))
      .catch(error => callback && callback(error));
  }
}

async function loadCurrentUser(req) {
  if (!req.session.user || !req.session.user.id) return null;
  const { rows } = await db.query(
    "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
    [req.session.user.id]
  );
  const user = rows[0];
  if (!user || !user.is_active || !["super_admin", "club_leader"].includes(user.role)) {
    await new Promise(resolve => req.session.destroy(() => resolve()));
    return null;
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  req.currentUser = req.session.user;
  return req.currentUser;
}

async function requireAuthenticated(req, res, next) {
  try {
    if (await loadCurrentUser(req)) return next();
    res.status(401).json({ error: "Please sign in to continue." });
  } catch (error) {
    next(error);
  }
}

async function requireLeader(req, res, next) {
  try {
    if (!await loadCurrentUser(req)) return res.status(401).json({ error: "Please sign in to continue." });
    if (!["super_admin", "club_leader"].includes(req.currentUser.role)) {
      return res.status(403).json({ error: "Leader access is required." });
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!await loadCurrentUser(req)) return res.status(401).json({ error: "Please sign in to continue." });
    if (req.currentUser.role !== "super_admin") {
      return res.status(403).json({ error: "Super Admin access is required." });
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function audit(req, action, targetType, targetId = "", details = {}) {
  await db.query(`INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details, ip_address)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
  [req.currentUser ? req.currentUser.id : null, action, targetType, String(targetId), JSON.stringify(details), req.ip]);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);
app.use(session({
  secret: sessionSecret,
  store: new PostgresSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || !req.get("origin")) return next();
  try {
    const requestOrigin = new URL(req.get("origin")).origin;
    const expectedOrigin = `${req.protocol}://${req.get("host")}`;
    if (requestOrigin !== expectedOrigin) return res.status(403).json({ error: "Cross-site request blocked." });
    next();
  } catch (_error) {
    res.status(403).json({ error: "Invalid request origin." });
  }
});

app.get("/healthz", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (_req, res) => res.sendFile(path.join(__dirname, "public", "portal.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(__dirname, "public", "portal.html")));
app.get("/leader", (_req, res) => res.sendFile(path.join(__dirname, "public", "portal.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/admin.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/register", (req, res) => {
  if (!req.session.user) return res.redirect("/login?next=register");
  res.sendFile(path.join(__dirname, "public", "registration.html"));
});
app.get("/registration.html", (req, res) => {
  if (!req.session.user) return res.redirect("/login?next=register");
  res.sendFile(path.join(__dirname, "public", "registration.html"));
});
app.get("/accept-invitation", (_req, res) => res.sendFile(path.join(__dirname, "public", "accept-invitation.html")));
app.get("/reset-password", (_req, res) => res.sendFile(path.join(__dirname, "public", "reset-password.html")));
app.use(express.static(path.join(__dirname, "public")));
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

app.post("/api/registrations", requireLeader, (req, res, next) => {
  registrationUpload.fields([{ name: "childPhotos", maxCount: 3 }, { name: "childIdentification", maxCount: 1 }])(req, res, error => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Each photo and the identification file must be 5 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
          ? "Upload no more than 3 photos and 1 identification file."
          : error.message;
      return res.status(400).json({ error: message });
    }

    const processRegistration = async () => {
    const body = req.body || {};
    const text = value => typeof value === "string" ? value.trim() : "";
    const childName = text(body.childName);
    const childDob = text(body.childDateOfBirth);
    const gender = text(body.gender);
    const rank = text(body.rank);
    const clubId = Number(body.clubId || body.clubName);
    const identificationType = text(body.childIdentificationType);
    const rawIdentificationNumber = text(body.childIdentificationNumber);
    const guardianFirstName = text(body.guardianFirstName);
    const guardianLastName = text(body.guardianLastName);
    const guardianName = `${guardianFirstName} ${guardianLastName}`.trim();
    const guardianRelationship = text(body.guardianRelationship);
    const guardianPhone = text(body.guardianPhone);
    const guardianEmail = text(body.guardianEmail);
    const location = text(body.location);
    const validRelationships = new Set(["Parent", "Legal guardian", "Grandparent", "Other caregiver"]);
    const parsedDob = /^\d{4}-\d{2}-\d{2}$/.test(childDob) ? new Date(`${childDob}T00:00:00Z`) : null;
    const validDob = parsedDob && !Number.isNaN(parsedDob.getTime()) &&
      parsedDob.toISOString().slice(0, 10) === childDob &&
      childDob <= new Date().toISOString().slice(0, 10);
    const reject = message => res.status(400).json({ error: message });

    if (!childName || !validDob || !["male", "female", "other", "prefer_not_to_say"].includes(gender) ||
        !rank || !Number.isSafeInteger(clubId) || clubId < 1 ||
        !guardianFirstName || !guardianLastName ||
        !validRelationships.has(guardianRelationship) || !guardianPhone || !guardianEmail || !location ||
        body.consent !== "true" && body.consent !== true) {
      return reject("Complete the required fields and confirm parent or guardian consent.");
    }
    if (childName.length > 160 || guardianFirstName.length > 80 || guardianLastName.length > 80 ||
        guardianPhone.length > 30 || guardianEmail.length > 254 || location.length > 160) {
      return reject("One or more fields exceed the allowed length.");
    }
    if (!/^[+()\d.\-\s]{7,30}$/.test(guardianPhone) || guardianPhone.replace(/\D/g, "").length < 7) {
      return reject("Enter a valid guardian phone number.");
    }
    if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
      return reject("Enter a valid guardian email address.");
    }

    const [{ rows: clubRows }, { rows: rankRows }] = await Promise.all([
      db.query("SELECT id, name, code FROM clubs WHERE id = $1 AND is_active = true", [clubId]),
      db.query("SELECT id FROM ranks WHERE name = $1 AND is_active = true", [rank])
    ]);
    const club = clubRows[0];
    if (!club || !rankRows[0]) return reject("Choose an active Awana club and rank.");
    if (req.currentUser.role === "club_leader") {
      const { rowCount } = await db.query(
        "SELECT 1 FROM leader_clubs WHERE user_id = $1 AND club_id = $2",
        [req.currentUser.id, clubId]
      );
      if (!rowCount) return res.status(403).json({ error: "You can only register children for a club assigned to your account." });
    }

    const photos = req.files.childPhotos || [];
    const identification = (req.files.childIdentification || [])[0];
    const identificationValidation = validateRegistrationIdentification(
      identificationType,
      rawIdentificationNumber,
      Boolean(identification)
    );
    if (identificationValidation.error) return reject(identificationValidation.error);
    const identificationNumber = identificationValidation.identificationNumber;
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
      const registrationId = await withTransaction(async client => {
        const { rows: childRows } = await client.query(
          "INSERT INTO children (full_name, date_of_birth, gender) VALUES ($1, $2, $3) RETURNING id",
          [childName, childDob, gender]
        );
        const { rows: guardianRows } = await client.query(`INSERT INTO guardians
          (first_name, last_name, relationship, phone, email, town_region)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [guardianFirstName, guardianLastName, guardianRelationship, guardianPhone, guardianEmail, location]);
        const { rows: registrationRows } = await client.query(`INSERT INTO registrations
          (child_name, child_dob, gender, programme, guardian_name, guardian_relationship, guardian_phone,
           guardian_email, location, consent, consent_at, rank, club_name, photos, identification_type,
           identification_number, identification_file, child_id, guardian_id, club_id, leader_user_id, rank_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, CURRENT_TIMESTAMP, $10, $11, $12, $13,
                  $14, $15, $16, $17, $18, $19, $20)
          RETURNING id`,
        [
          childName, childDob, gender, rank, guardianName, guardianRelationship, guardianPhone, guardianEmail,
          location, rank, club.name, JSON.stringify(photoNames), identificationType, identificationNumber || "",
          identificationName, childRows[0].id, guardianRows[0].id, clubId, req.currentUser.id, rankRows[0].id
        ]);
        const id = registrationRows[0].id;
        if (identificationType) {
          await client.query(`INSERT INTO child_documents
            (registration_id, document_type, document_number, storage_key)
            VALUES ($1, $2, $3, $4)`,
          [id, identificationType, identificationNumber || "", identificationName]);
        }
        for (const photoName of photoNames) {
          await client.query("INSERT INTO child_photos (registration_id, storage_key) VALUES ($1, $2)", [id, photoName]);
        }
        await client.query(`INSERT INTO audit_logs
          (actor_user_id, action, target_type, target_id, details, ip_address)
          VALUES ($1, 'child.registered', 'registration', $2, $3::jsonb, $4)`,
        [req.currentUser.id, String(id), JSON.stringify({ clubId, rank }), req.ip]);
        return id;
      });
      res.status(201).json({ success: true, registrationId });
    } catch (registrationError) {
      try {
        await removeStorageFiles(registrationAssets, uploadedNames);
      } catch (cleanupError) {
        console.error("Could not clean up registration uploads after a failed registration:", cleanupError);
      }
      return next(registrationError);
    }
    };
    processRegistration().catch(next);
  });
});

const loginFailures = new Map();
const dummyPasswordHash = bcrypt.hashSync("invalid-login-timing-protection", 12);
app.post("/api/login", async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const attemptKey = req.ip;
  const attempt = loginFailures.get(attemptKey);
  if (attempt && attempt.count >= 10 && Date.now() - attempt.startedAt < 15 * 60 * 1000) {
    return res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
  }
  if (attempt && Date.now() - attempt.startedAt >= 15 * 60 * 1000) loginFailures.delete(attemptKey);
  const { rows } = await db.query(
    "SELECT id, name, email, password, role, is_active FROM users WHERE lower(email) = $1",
    [email]
  );
  const user = rows[0];
  const matches = await bcrypt.compare(password, user ? user.password : dummyPasswordHash);
  if (!user || !user.is_active || !matches ||
      !["super_admin", "club_leader"].includes(user.role)) {
    const previous = loginFailures.get(attemptKey);
    loginFailures.set(attemptKey, {
      startedAt: previous && Date.now() - previous.startedAt < 15 * 60 * 1000 ? previous.startedAt : Date.now(),
      count: previous && Date.now() - previous.startedAt < 15 * 60 * 1000 ? previous.count + 1 : 1
    });
    return res.status(401).json({ error: "Invalid email or password." });
  }
  loginFailures.delete(attemptKey);
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.cookie.maxAge = body.rememberMe === true ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  await audit({ currentUser: req.session.user, ip: req.ip }, "auth.login", "user", user.id);
  res.json({ success: true, user: req.session.user });
});

app.post("/api/logout", async (req, res, next) => {
  try {
    const user = await loadCurrentUser(req);
    if (user) await audit({ currentUser: user, ip: req.ip }, "auth.logout", "user", user.id);
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    res.json({ user: await loadCurrentUser(req) });
  } catch (error) {
    next(error);
  }
});

function isStrongPassword(value) {
  return typeof value === "string" && value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72;
}

function normalizePositiveIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0))];
}

app.get("/api/portal/metadata", requireLeader, async (req, res) => {
  const [clubsResult, ranksResult] = await Promise.all([
    req.currentUser.role === "super_admin"
      ? db.query("SELECT id, name, code, region FROM clubs WHERE is_active ORDER BY name")
      : db.query(`SELECT c.id, c.name, c.code, c.region
          FROM clubs c JOIN leader_clubs lc ON lc.club_id = c.id
          WHERE lc.user_id = $1 AND c.is_active ORDER BY c.name`, [req.currentUser.id]),
    db.query("SELECT id, name, age_group FROM ranks WHERE is_active ORDER BY sort_order, name")
  ]);
  res.json({ clubs: clubsResult.rows, ranks: ranksResult.rows });
});

app.post("/api/admin/leaders/invitations", requireAdmin, async (req, res) => {
  const firstName = typeof req.body.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body.lastName === "string" ? req.body.lastName.trim() : "";
  const email = normalizeEmail(req.body.email);
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  const clubIds = normalizePositiveIds(req.body.clubIds);
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      phone.length > 30 || clubIds.length === 0) {
    return res.status(400).json({ error: "Enter the leader’s first name, last name, valid email and at least one club." });
  }
  const { rows: existingUsers } = await db.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existingUsers.length) return res.status(409).json({ error: "An account already exists for this email." });
  const { rows: matchedClubs } = await db.query(
    "SELECT id FROM clubs WHERE id = ANY($1::bigint[]) AND is_active",
    [clubIds]
  );
  if (matchedClubs.length !== clubIds.length) return res.status(400).json({ error: "Choose only active clubs." });

  const { token, tokenHash } = createOneTimeToken();
  const invitation = await withTransaction(async client => {
    await client.query(`UPDATE leader_invitations SET revoked_at = CURRENT_TIMESTAMP
      WHERE lower(email) = $1 AND accepted_at IS NULL AND revoked_at IS NULL`, [email]);
    const { rows } = await client.query(`INSERT INTO leader_invitations
      (email, first_name, last_name, phone, token_hash, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '7 days')
      RETURNING id`, [email, firstName, lastName, phone, tokenHash, req.currentUser.id]);
    for (const clubId of clubIds) {
      await client.query("INSERT INTO invitation_clubs (invitation_id, club_id) VALUES ($1, $2)", [rows[0].id, clubId]);
    }
    return rows[0];
  });
  await audit(req, "leader.invited", "invitation", invitation.id, { email, clubIds });
  res.status(201).json({
    invitationPath: `/accept-invitation?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
});

app.get("/api/invitations/:token", async (req, res) => {
  const tokenHash = hashOneTimeToken(req.params.token);
  if (!tokenHash) return res.status(404).json({ error: "This invitation is invalid or has expired." });
  const { rows } = await db.query(`SELECT i.email, i.first_name, i.last_name, i.expires_at,
      COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name, 'code', c.code)
        ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS clubs
    FROM leader_invitations i
    LEFT JOIN invitation_clubs ic ON ic.invitation_id = i.id
    LEFT JOIN clubs c ON c.id = ic.club_id
    WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > CURRENT_TIMESTAMP
    GROUP BY i.id`, [tokenHash]);
  if (!rows[0]) return res.status(404).json({ error: "This invitation is invalid or has expired." });
  res.json(rows[0]);
});

app.post("/api/invitations/accept", async (req, res) => {
  const tokenHash = hashOneTimeToken(req.body.token);
  const password = req.body.password;
  if (!tokenHash || !isStrongPassword(password)) {
    return res.status(400).json({ error: "Use a valid invitation and a password of 12–72 bytes." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const accepted = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT * FROM leader_invitations
      WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP FOR UPDATE`, [tokenHash]);
    const invitation = rows[0];
    if (!invitation) return null;
    const { rows: userRows } = await client.query(`INSERT INTO users (name, email, password, role, is_active)
      VALUES ($1, $2, $3, 'club_leader', true) RETURNING id`,
    [`${invitation.first_name} ${invitation.last_name}`, invitation.email, passwordHash]);
    const userId = userRows[0].id;
    await client.query(`INSERT INTO leader_profiles (user_id, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4)`, [userId, invitation.first_name, invitation.last_name, invitation.phone]);
    await client.query(`INSERT INTO leader_clubs (user_id, club_id, assigned_by)
      SELECT $1, club_id, $2 FROM invitation_clubs WHERE invitation_id = $3`,
    [userId, invitation.invited_by, invitation.id]);
    await client.query("UPDATE leader_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1", [invitation.id]);
    await client.query(`INSERT INTO audit_logs
      (actor_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, 'leader.invitation_accepted', 'user', $2, $3::jsonb, $4)`,
    [userId, String(userId), JSON.stringify({ invitationId: invitation.id }), req.ip]);
    return { email: invitation.email };
  });
  if (!accepted) return res.status(400).json({ error: "This invitation is invalid or has expired." });
  res.status(201).json({ success: true, email: accepted.email });
});

app.post("/api/admin/leaders/:id/password-reset", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ error: "Invalid leader account." });
  const { rows: users } = await db.query(
    "SELECT id, email FROM users WHERE id = $1 AND role = 'club_leader' AND is_active",
    [userId]
  );
  if (!users[0]) return res.status(404).json({ error: "Active leader account not found." });
  const { token, tokenHash } = createOneTimeToken();
  const reset = await withTransaction(async client => {
    await client.query("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL", [userId]);
    const { rows } = await client.query(`INSERT INTO password_resets (user_id, token_hash, expires_at, created_by)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '2 hours', $3) RETURNING id`,
    [userId, tokenHash, req.currentUser.id]);
    return rows[0];
  });
  await audit(req, "leader.password_reset_issued", "password_reset", reset.id, { userId });
  res.status(201).json({
    resetPath: `/reset-password?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  });
});

app.get("/api/password-resets/:token", async (req, res) => {
  const tokenHash = hashOneTimeToken(req.params.token);
  if (!tokenHash) return res.status(404).json({ error: "This reset link is invalid or has expired." });
  const { rows } = await db.query(`SELECT u.email, p.expires_at FROM password_resets p
    JOIN users u ON u.id = p.user_id
    WHERE p.token_hash = $1 AND p.used_at IS NULL AND p.expires_at > CURRENT_TIMESTAMP
      AND u.is_active`, [tokenHash]);
  if (!rows[0]) return res.status(404).json({ error: "This reset link is invalid or has expired." });
  res.json(rows[0]);
});

app.post("/api/password-resets/complete", async (req, res) => {
  const tokenHash = hashOneTimeToken(req.body.token);
  const password = req.body.password;
  if (!tokenHash || !isStrongPassword(password)) {
    return res.status(400).json({ error: "Use a valid reset link and a password of 12–72 bytes." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT p.id, p.user_id FROM password_resets p
      JOIN users u ON u.id = p.user_id
      WHERE p.token_hash = $1 AND p.used_at IS NULL AND p.expires_at > CURRENT_TIMESTAMP
        AND u.is_active FOR UPDATE OF p, u`, [tokenHash]);
    if (!rows[0]) return null;
    const reset = rows[0];
    await client.query("UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [passwordHash, reset.user_id]);
    await client.query("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = $1", [reset.id]);
    await client.query("DELETE FROM web_sessions WHERE sess->'user'->>'id' = $1", [String(reset.user_id)]);
    await client.query(`INSERT INTO audit_logs
      (actor_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, 'auth.password_reset', 'user', $2, '{}'::jsonb, $3)`,
    [reset.user_id, String(reset.user_id), req.ip]);
    return reset.user_id;
  });
  if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired." });
  res.json({ success: true });
});

app.get("/api/admin/leaders", requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`SELECT u.id, u.name, u.email, u.is_active, u.created_at,
      p.first_name, p.last_name, p.phone,
      COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name, 'code', c.code)
        ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS clubs,
      MAX(a.created_at) AS last_activity
    FROM users u
    LEFT JOIN leader_profiles p ON p.user_id = u.id
    LEFT JOIN leader_clubs lc ON lc.user_id = u.id
    LEFT JOIN clubs c ON c.id = lc.club_id
    LEFT JOIN audit_logs a ON a.actor_user_id = u.id
    WHERE u.role = 'club_leader'
    GROUP BY u.id, p.first_name, p.last_name, p.phone
    ORDER BY u.created_at DESC LIMIT 500`);
  res.json(rows);
});

app.patch("/api/admin/leaders/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1 || typeof req.body.isActive !== "boolean") {
    return res.status(400).json({ error: "Choose a valid leader account status." });
  }
  const result = await db.query(`UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND role = 'club_leader'`, [req.body.isActive, userId]);
  if (!result.rowCount) return res.status(404).json({ error: "Leader account not found." });
  if (!req.body.isActive) {
    await db.query("DELETE FROM web_sessions WHERE sess->'user'->>'id' = $1", [String(userId)]);
  }
  await audit(req, req.body.isActive ? "leader.activated" : "leader.suspended", "user", userId);
  res.json({ success: true });
});

app.put("/api/admin/leaders/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const firstName = typeof req.body.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body.lastName === "string" ? req.body.lastName.trim() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  const clubIds = normalizePositiveIds(req.body.clubIds);
  if (!Number.isSafeInteger(userId) || userId < 1 || !firstName || !lastName ||
      firstName.length > 80 || lastName.length > 80 || phone.length > 30 || clubIds.length === 0) {
    return res.status(400).json({ error: "Enter a valid leader profile and assign at least one club." });
  }
  const { rows: validClubs } = await db.query("SELECT id FROM clubs WHERE id = ANY($1::bigint[]) AND is_active", [clubIds]);
  if (validClubs.length !== clubIds.length) return res.status(400).json({ error: "Choose only active clubs." });
  const updated = await withTransaction(async client => {
    const { rowCount } = await client.query(
      "UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND role = 'club_leader'",
      [`${firstName} ${lastName}`, userId]
    );
    if (!rowCount) return false;
    await client.query(`INSERT INTO leader_profiles (user_id, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, updated_at = CURRENT_TIMESTAMP`,
    [userId, firstName, lastName, phone]);
    await client.query("DELETE FROM leader_clubs WHERE user_id = $1", [userId]);
    for (const clubId of clubIds) {
      await client.query("INSERT INTO leader_clubs (user_id, club_id, assigned_by) VALUES ($1, $2, $3)",
        [userId, clubId, req.currentUser.id]);
    }
    return true;
  });
  if (!updated) return res.status(404).json({ error: "Leader account not found." });
  await audit(req, "leader.profile_updated", "user", userId, { clubIds });
  res.json({ success: true });
});

app.get("/api/admin/clubs", requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`SELECT c.*,
    (SELECT COUNT(*)::int FROM leader_clubs lc WHERE lc.club_id = c.id) AS leader_count,
    (SELECT COUNT(*)::int FROM registrations r WHERE r.club_id = c.id) AS registration_count
    FROM clubs c ORDER BY c.name`);
  res.json(rows);
});

app.post("/api/admin/clubs", requireAdmin, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim().toUpperCase() : "";
  const code = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const region = typeof req.body.region === "string" ? req.body.region.trim() : "";
  const slug = typeof req.body.slug === "string" ? req.body.slug.trim().toLowerCase() : "";
  if (!name || name.length > 160 || !code || code.length > 30 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || region.length > 100) {
    return res.status(400).json({ error: "Enter a valid club name, code and lowercase hyphenated slug." });
  }
  const { rows } = await db.query(`INSERT INTO clubs (name, code, slug, region)
    VALUES ($1, $2, $3, $4) RETURNING *`, [name, code, slug, region]);
  await audit(req, "club.created", "club", rows[0].id);
  res.status(201).json(rows[0]);
});

app.patch("/api/admin/clubs/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body.isActive !== "boolean") {
    return res.status(400).json({ error: "Choose a valid club status." });
  }
  const { rowCount } = await db.query(
    "UPDATE clubs SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [req.body.isActive, id]
  );
  if (!rowCount) return res.status(404).json({ error: "Club not found." });
  await audit(req, req.body.isActive ? "club.activated" : "club.suspended", "club", id);
  res.json({ success: true });
});

app.get("/api/admin/ranks", requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`SELECT r.*,
    (SELECT COUNT(*)::int FROM registrations x WHERE x.rank_id = r.id) AS registration_count
    FROM ranks r ORDER BY sort_order, name`);
  res.json(rows);
});

app.post("/api/admin/ranks", requireAdmin, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const ageGroup = typeof req.body.ageGroup === "string" ? req.body.ageGroup.trim() : "";
  if (!name || name.length > 80 || ageGroup.length > 80) {
    return res.status(400).json({ error: "Enter a rank name and age group." });
  }
  const { rows } = await db.query(`INSERT INTO ranks (name, age_group, sort_order)
    VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM ranks), 1)) RETURNING *`, [name, ageGroup]);
  await audit(req, "rank.created", "rank", rows[0].id);
  res.status(201).json(rows[0]);
});

app.patch("/api/admin/ranks/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body.isActive !== "boolean") {
    return res.status(400).json({ error: "Choose a valid rank status." });
  }
  const { rowCount } = await db.query("UPDATE ranks SET is_active = $1 WHERE id = $2", [req.body.isActive, id]);
  if (!rowCount) return res.status(404).json({ error: "Rank not found." });
  await audit(req, req.body.isActive ? "rank.activated" : "rank.suspended", "rank", id);
  res.json({ success: true });
});

app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows } = await db.query(`SELECT a.id, a.action, a.target_type, a.target_id, a.details,
      a.ip_address, a.created_at, u.name AS actor_name, u.email AS actor_email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  res.json(rows);
});

app.get("/api/portal/profile", requireLeader, async (req, res) => {
  const [{ rows: userRows }, { rows: profileRows }, { rows: clubRows }] = await Promise.all([
    db.query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [req.currentUser.id]),
    db.query("SELECT first_name, last_name, phone FROM leader_profiles WHERE user_id = $1", [req.currentUser.id]),
    db.query(`SELECT c.id, c.name, c.code FROM clubs c JOIN leader_clubs lc ON lc.club_id = c.id
      WHERE lc.user_id = $1 ORDER BY c.name`, [req.currentUser.id])
  ]);
  res.json({ ...userRows[0], profile: profileRows[0] || null, clubs: clubRows });
});

app.put("/api/portal/profile", requireLeader, async (req, res) => {
  const firstName = typeof req.body.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body.lastName === "string" ? req.body.lastName.trim() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80 || phone.length > 30) {
    return res.status(400).json({ error: "Enter your first name, last name and a valid phone number." });
  }
  await withTransaction(async client => {
    await client.query("UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [`${firstName} ${lastName}`, req.currentUser.id]);
    await client.query(`INSERT INTO leader_profiles (user_id, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, updated_at = CURRENT_TIMESTAMP`,
    [req.currentUser.id, firstName, lastName, phone]);
  });
  await audit(req, "leader.profile_updated", "user", req.currentUser.id);
  res.json({ success: true });
});

app.get("/api/portal/dashboard", requireLeader, async (req, res) => {
  const scope = req.currentUser.role === "super_admin" ? "TRUE" :
    "r.club_id = ANY(ARRAY(SELECT club_id FROM leader_clubs WHERE user_id = $1))";
  const values = req.currentUser.role === "super_admin" ? [] : [req.currentUser.id];
  const [total, recent, ranks, ages, history, clubs] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS count FROM registrations r WHERE ${scope}`, values),
    db.query(`SELECT COUNT(*)::int AS count FROM registrations r
      WHERE ${scope} AND r.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`, values),
    db.query(`SELECT rk.name, COUNT(*)::int AS count FROM registrations r
      JOIN ranks rk ON rk.id = r.rank_id WHERE ${scope} GROUP BY rk.name, rk.sort_order
      ORDER BY rk.sort_order`, values),
    db.query(`SELECT CASE
        WHEN date_part('year', age(CURRENT_DATE, ch.date_of_birth)) < 5 THEN 'Under 5'
        WHEN date_part('year', age(CURRENT_DATE, ch.date_of_birth)) < 9 THEN '5–8'
        WHEN date_part('year', age(CURRENT_DATE, ch.date_of_birth)) < 13 THEN '9–12'
        ELSE '13+' END AS age_group, COUNT(*)::int AS count
      FROM registrations r JOIN children ch ON ch.id = r.child_id
      WHERE ${scope} GROUP BY age_group ORDER BY age_group`, values),
    db.query(`SELECT r.id, ch.full_name, rk.name AS rank, c.name AS club_name, r.created_at
      FROM registrations r JOIN children ch ON ch.id = r.child_id
      LEFT JOIN ranks rk ON rk.id = r.rank_id LEFT JOIN clubs c ON c.id = r.club_id
      WHERE ${scope} ORDER BY r.created_at DESC LIMIT 10`, values),
    req.currentUser.role === "super_admin"
      ? db.query("SELECT id, name, code FROM clubs WHERE is_active ORDER BY name")
      : db.query(`SELECT c.id, c.name, c.code FROM clubs c JOIN leader_clubs lc ON lc.club_id = c.id
          WHERE lc.user_id = $1 ORDER BY c.name`, values)
  ]);
  res.json({
    totalChildren: total.rows[0].count,
    newRegistrations: recent.rows[0].count,
    byRank: ranks.rows,
    byAgeGroup: ages.rows,
    history: history.rows,
    clubs: clubs.rows
  });
});

app.get("/api/portal/children", requireLeader, async (req, res) => {
  const conditions = [];
  const values = [];
  if (req.currentUser.role !== "super_admin") {
    values.push(req.currentUser.id);
    conditions.push(`r.club_id = ANY(ARRAY(SELECT club_id FROM leader_clubs WHERE user_id = $${values.length}))`);
  }
  const clubId = Number(req.query.clubId);
  if (req.query.clubId && Number.isSafeInteger(clubId) && clubId > 0) {
    values.push(clubId);
    conditions.push(`r.club_id = $${values.length}`);
  }
  const rankId = Number(req.query.rankId);
  if (req.query.rankId && Number.isSafeInteger(rankId) && rankId > 0) {
    values.push(rankId);
    conditions.push(`r.rank_id = $${values.length}`);
  }
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  if (search) {
    values.push(`%${search.replace(/[%_]/g, "\\$&")}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(ch.full_name ILIKE ${parameter} ESCAPE '\\' OR g.first_name ILIKE ${parameter} ESCAPE '\\'
      OR g.last_name ILIKE ${parameter} ESCAPE '\\' OR g.phone ILIKE ${parameter} ESCAPE '\\')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS count FROM registrations r
      JOIN children ch ON ch.id = r.child_id JOIN guardians g ON g.id = r.guardian_id ${where}`, values),
    db.query(`SELECT r.id, ch.full_name AS child_name, ch.date_of_birth, ch.gender,
        g.first_name AS guardian_first_name, g.last_name AS guardian_last_name,
        g.relationship, g.phone, g.email, g.town_region, c.id AS club_id, c.name AS club_name,
        rk.id AS rank_id, rk.name AS rank, r.identification_type, r.identification_number,
        r.identification_file, r.created_at, r.consent_at, r.status,
        COALESCE((SELECT json_agg(cp.storage_key ORDER BY cp.id) FROM child_photos cp
          WHERE cp.registration_id = r.id), '[]'::json) AS photos
      FROM registrations r JOIN children ch ON ch.id = r.child_id
      JOIN guardians g ON g.id = r.guardian_id LEFT JOIN clubs c ON c.id = r.club_id
      LEFT JOIN ranks rk ON rk.id = r.rank_id ${where}
      ORDER BY r.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize])
  ]);
  res.json({ rows, total: countRows[0].count, page, pageSize });
});

app.get("/api/portal/children/export.csv", requireLeader, async (req, res) => {
  const conditions = [];
  const values = [];
  if (req.currentUser.role !== "super_admin") {
    values.push(req.currentUser.id);
    conditions.push(`r.club_id = ANY(ARRAY(SELECT club_id FROM leader_clubs WHERE user_id = $${values.length}))`);
  }
  const clubId = Number(req.query.clubId);
  if (req.query.clubId && Number.isSafeInteger(clubId) && clubId > 0) {
    values.push(clubId);
    conditions.push(`r.club_id = $${values.length}`);
  }
  const rankId = Number(req.query.rankId);
  if (req.query.rankId && Number.isSafeInteger(rankId) && rankId > 0) {
    values.push(rankId);
    conditions.push(`r.rank_id = $${values.length}`);
  }
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  if (search) {
    values.push(`%${search.replace(/[%_]/g, "\\$&")}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(ch.full_name ILIKE ${parameter} ESCAPE '\\' OR g.first_name ILIKE ${parameter} ESCAPE '\\'
      OR g.last_name ILIKE ${parameter} ESCAPE '\\' OR g.phone ILIKE ${parameter} ESCAPE '\\')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query(`SELECT ch.full_name AS child_name, ch.date_of_birth, ch.gender,
      rk.name AS rank, c.name AS club_name, g.first_name AS guardian_first_name,
      g.last_name AS guardian_last_name, g.relationship, g.phone, g.email, g.town_region,
      r.identification_type, r.identification_number, r.created_at
    FROM registrations r JOIN children ch ON ch.id = r.child_id
    JOIN guardians g ON g.id = r.guardian_id LEFT JOIN clubs c ON c.id = r.club_id
    LEFT JOIN ranks rk ON rk.id = r.rank_id ${where}
    ORDER BY r.created_at DESC LIMIT 10000`, values);
  const columns = ["Child", "Date of birth", "Gender", "Rank", "Club", "Guardian first name",
    "Guardian last name", "Relationship", "Phone", "Email", "Town / region", "Identification type",
    "Identification number", "Registered"];
  const csvCell = value => {
    let text = String(value ?? "").replace(/[\r\n]+/g, " ");
    if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [columns, ...rows.map(row => [
    row.child_name, row.date_of_birth, row.gender, row.rank, row.club_name,
    row.guardian_first_name, row.guardian_last_name, row.relationship, row.phone,
    row.email, row.town_region, row.identification_type, row.identification_number, row.created_at
  ])].map(row => row.map(csvCell).join(",")).join("\r\n");
  await audit(req, "children.exported", "report", "", { rowCount: rows.length, format: "csv" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="awana-child-registrations.csv"');
  res.send(`\uFEFF${csv}`);
});

app.patch("/api/portal/registrations/:id", requireLeader, async (req, res) => {
  const registrationId = Number(req.params.id);
  const status = req.body.status;
  if (!Number.isSafeInteger(registrationId) || registrationId < 1 ||
      !["submitted", "reviewed", "withdrawn"].includes(status)) {
    return res.status(400).json({ error: "Choose a valid registration status." });
  }
  const values = [status, registrationId];
  const scope = req.currentUser.role === "super_admin" ? "" :
    "AND EXISTS (SELECT 1 FROM leader_clubs lc WHERE lc.user_id = $3 AND lc.club_id = r.club_id)";
  if (scope) values.push(req.currentUser.id);
  const result = await db.query(`UPDATE registrations r SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE r.id = $2 AND r.child_id IS NOT NULL ${scope}`, values);
  if (!result.rowCount) return res.status(404).json({ error: "Registration not found in your assigned club." });
  await audit(req, "registration.status_updated", "registration", registrationId, { status });
  res.json({ success: true });
});

app.delete("/api/portal/registrations/:id", requireAdmin, async (req, res) => {
  const registrationId = Number(req.params.id);
  if (!Number.isSafeInteger(registrationId) || registrationId < 1) {
    return res.status(400).json({ error: "Invalid registration." });
  }
  const deleted = await withTransaction(async client => {
    const { rows } = await client.query(`SELECT id, child_id, guardian_id FROM registrations
      WHERE id = $1 AND child_id IS NOT NULL FOR UPDATE`, [registrationId]);
    if (!rows[0]) return null;
    const registration = rows[0];
    const { rows: files } = await client.query(`SELECT storage_key FROM child_documents WHERE registration_id = $1
      UNION SELECT storage_key FROM child_photos WHERE registration_id = $1`, [registrationId]);
    await client.query(`INSERT INTO audit_logs
      (actor_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, 'registration.deleted', 'registration', $2, '{}'::jsonb, $3)`,
    [req.currentUser.id, String(registrationId), req.ip]);
    await client.query("DELETE FROM registrations WHERE id = $1", [registrationId]);
    await client.query("DELETE FROM children WHERE id = $1", [registration.child_id]);
    await client.query("DELETE FROM guardians WHERE id = $1", [registration.guardian_id]);
    return files.map(file => file.storage_key).filter(filename =>
      typeof filename === "string" && /^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename)
    );
  });
  if (!deleted) return res.status(404).json({ error: "Registration not found." });
  try {
    await removeStorageFiles(registrationAssets, deleted);
  } catch (error) {
    console.error("Registration was deleted but private file cleanup failed:", error);
    return res.status(500).json({ error: "The registration was deleted, but private files could not be removed. Contact support." });
  }
  res.json({ success: true });
});

app.get("/api/portal/my-club", requireLeader, async (req, res) => {
  const { rows } = await db.query(`SELECT c.id, c.name, c.code, c.region, c.is_active,
      COUNT(r.id)::int AS children_registered,
      COUNT(*) FILTER (WHERE r.created_at >= CURRENT_DATE)::int AS registered_today
    FROM clubs c JOIN leader_clubs lc ON lc.club_id = c.id
    LEFT JOIN registrations r ON r.club_id = c.id AND r.child_id IS NOT NULL
    WHERE lc.user_id = $1 GROUP BY c.id ORDER BY c.name`, [req.currentUser.id]);
  res.json(rows);
});

app.get("/api/admin/documents", requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`SELECT d.id, d.document_type, d.document_number, d.storage_key,
      d.created_at, r.id AS registration_id, ch.full_name AS child_name, c.name AS club_name
    FROM child_documents d JOIN registrations r ON r.id = d.registration_id
    JOIN children ch ON ch.id = r.child_id LEFT JOIN clubs c ON c.id = r.club_id
    ORDER BY d.created_at DESC LIMIT 500`);
  res.json(rows);
});

app.get("/api/portal/registrations/:id/files/:filename", requireLeader, async (req, res) => {
  const registrationId = Number(req.params.id);
  const filename = req.params.filename;
  if (!Number.isSafeInteger(registrationId) || registrationId < 1 ||
      !/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid file reference." });
  }
  const values = [registrationId, filename];
  const scope = req.currentUser.role === "super_admin" ? "TRUE" :
    "EXISTS (SELECT 1 FROM leader_clubs lc WHERE lc.user_id = $3 AND lc.club_id = r.club_id)";
  if (req.currentUser.role !== "super_admin") values.push(req.currentUser.id);
  const { rows } = await db.query(`SELECT f.storage_key FROM (
      SELECT registration_id, storage_key FROM child_documents
      UNION ALL
      SELECT registration_id, storage_key FROM child_photos
    ) f JOIN registrations r ON r.id = f.registration_id
    WHERE r.id = $1 AND f.storage_key = $2 AND ${scope}`, values);
  if (!rows[0]) return res.status(404).json({ error: "Document not found." });
  const { data, error } = await registrationAssets.download(filename);
  if (error) {
    if (String(error.statusCode) === "404") return res.status(404).json({ error: "Document not found." });
    throw error;
  }
  await audit(req, "child_document.viewed", "registration", registrationId, { filename });
  res.type(path.extname(filename));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(await data.arrayBuffer()));
});

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
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 20, fieldSize: 16 * 1024 },
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
