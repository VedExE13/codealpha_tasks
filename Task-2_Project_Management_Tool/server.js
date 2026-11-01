const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const app = express();
const port = Number(process.env.PORT || 3000);
const APP_TASK = 'board';
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'codealpha.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL,
    description TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    total INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium', assignee TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comms_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comms_members (
    room_id INTEGER NOT NULL REFERENCES comms_rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS comms_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES comms_rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS comms_events_room_id ON comms_events(room_id,id);
`);
db.exec('INSERT OR IGNORE INTO project_members (project_id,user_id,role) SELECT id,user_id,\'owner\' FROM projects');

const seed = [
  [1,'Arc Wireless Headphones','Tech',7499,'Immersive sound, all-day comfort, and 40-hour battery life.','🎧','#e8e3d8',1],
  [2,'Everyday Canvas Tote','Lifestyle',1899,'A durable carryall made from heavyweight recycled cotton.','👜','#e8ddd6',1],
  [3,'Stoneware Coffee Set','Home',3299,'Two hand-finished cups for slow mornings and good company.','☕','#dddcd2',1],
  [4,'Ripple Glass Bottle','Lifestyle',1299,'Lightweight borosilicate glass with a soft silicone sleeve.','🫙','#dce6df',0],
  [5,'Desk Light Mini','Home',4599,'A warm, adjustable glow for late-night ideas.','💡','#e4dfec',0],
  [6,'Field Notes Journal','Stationery',999,'Lay-flat pages, a cloth cover, and plenty of room to think.','📓','#e9e0cf',0],
  [7,'Cloud Knit Throw','Home',5899,'A soft, breathable layer for a well-earned pause.','🧶','#e6dce0',0],
  [8,'Pocket Speaker','Tech',3999,'Big sound in a small, waterproof, weekend-ready package.','🔊','#d9e0e7',0]
];
const addProduct = db.prepare('INSERT OR IGNORE INTO products (id,name,category,price,description,emoji,color,featured) VALUES (?,?,?,?,?,?,?,?)');
for (const item of seed) addProduct.run(...item);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); }
}));
const authLimiter = new Map();
function limitAuth(req, res, next) {
  const ip = req.ip || 'unknown'; const now = Date.now();
  const entry = authLimiter.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  if (++entry.count > 30) return res.status(429).json({ error: 'Too many attempts. Please try again in a minute.' });
  authLimiter.set(ip, entry); next();
}
function asyncHash(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString('hex'))));
}
function safeUser(row) { return { id: row.id, name: row.name, email: row.email }; }
function requireAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  const session = db.prepare('SELECT s.token, s.expires_at, u.id, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  if (!session || session.expires_at < Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
  req.user = safeUser(session); req.token = session.token; next();
}
const emailOk = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
app.post('/api/auth/register', limitAuth, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 60 || !emailOk(email) || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Use a name (2–60 characters), a valid email, and a password with at least 8 characters.' });
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await asyncHash(password, salt);
    const result = db.prepare('INSERT INTO users (name,email,password_hash,password_salt) VALUES (?,?,?,?)').run(name, email, hash, salt);
    const user = safeUser({ id: result.lastInsertRowid, name, email });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, Date.now() + 7 * 86400000);
    if (APP_TASK === 'board') {
    const project = db.prepare('INSERT INTO projects (user_id,name,description) VALUES (?,?,?)').run(user.id, 'Studio launch', 'A shared space to plan what we ship next.');
    db.prepare('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)').run(project.lastInsertRowid,user.id,'owner');
    const taskInsert = db.prepare('INSERT INTO tasks (project_id,title,description,status,priority,assignee,due_date) VALUES (?,?,?,?,?,?,?)');
    taskInsert.run(project.lastInsertRowid,'Sketch the first storefront','Explore a warm, editorial direction for the collection.','inprogress','high',name,'');
    taskInsert.run(project.lastInsertRowid,'Prepare product photography','Collect imagery and write the launch shot list.','todo','medium','', '');
    taskInsert.run(project.lastInsertRowid,'Plan the opening week','Map the first seven days of updates and offers.','todo','low','', '');
    }
    res.status(201).json({ token, user });
  } catch (err) { if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That email already has an account. Try signing in.' }); next(err); }
});
app.post('/api/auth/login', limitAuth, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!row || !crypto.timingSafeEqual(Buffer.from(await asyncHash(password, row.password_salt), 'hex'), Buffer.from(row.password_hash, 'hex'))) return res.status(401).json({ error: 'That email and password do not match.' });
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, row.id, Date.now() + 7 * 86400000);
    res.json({ token, user: safeUser(row) });
  } catch (err) { next(err); }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', requireAuth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token=?').run(req.token); res.json({ ok: true }); });

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY featured DESC, id').all();
  res.json({ products });
});
app.post('/api/orders', requireAuth, (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length || items.length > 30) return res.status(400).json({ error: 'Add at least one item to your bag.' });
  const parsed = new Map();
  for (const item of items) {
    const id = Number(item?.productId); const quantity = Number(item?.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) return res.status(400).json({ error: 'One of the items in your bag is invalid.' });
    parsed.set(id, (parsed.get(id) || 0) + quantity);
  }
  const products = db.prepare(`SELECT * FROM products WHERE id IN (${[...parsed.keys()].map(() => '?').join(',')})`).all(...parsed.keys());
  if (products.length !== parsed.size) return res.status(400).json({ error: 'A product in your bag is no longer available.' });
  const total = products.reduce((sum, product) => sum + product.price * parsed.get(product.id), 0);
  const create = db.transaction(() => {
    const order = db.prepare('INSERT INTO orders (user_id,total) VALUES (?,?)').run(req.user.id,total);
    const insertItem = db.prepare('INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)');
    products.forEach(product => insertItem.run(order.lastInsertRowid, product.id, parsed.get(product.id), product.price));
    return Number(order.lastInsertRowid);
  });
  res.status(201).json({ orderId: create(), total });
});
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT id,total,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  for (const order of orders) order.items = db.prepare('SELECT p.name,p.emoji,oi.quantity,oi.unit_price FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?').all(order.id);
  res.json({ orders });
});

function ownedProject(req, res, next) {
  const projectId = Number(req.params.projectId);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'Choose a valid project.' });
  const project = db.prepare('SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE p.id=? AND pm.user_id=?').get(projectId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  req.project = project; next();
}
app.get('/api/projects', requireAuth, (req, res) => res.json({ projects: db.prepare('SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=? ORDER BY p.id').all(req.user.id) }));
app.post('/api/projects', requireAuth, (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (name.length < 2 || name.length > 80 || description.length > 280) return res.status(400).json({ error: 'Project names need 2–80 characters; descriptions can be up to 280.' });
  const created = db.prepare('INSERT INTO projects (user_id,name,description) VALUES (?,?,?)').run(req.user.id,name,description);
  db.prepare('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)').run(created.lastInsertRowid,req.user.id,'owner');
  res.status(201).json({ project: db.prepare('SELECT * FROM projects WHERE id=?').get(created.lastInsertRowid) });
});
app.get('/api/projects/:projectId', requireAuth, ownedProject, (req, res) => {
  const tasks = db.prepare('SELECT t.*, (SELECT count(*) FROM comments c WHERE c.task_id=t.id) comment_count FROM tasks t WHERE t.project_id=? ORDER BY CASE t.status WHEN \'inprogress\' THEN 1 WHEN \'todo\' THEN 2 ELSE 3 END, t.id DESC').all(req.project.id);
  res.json({ project: req.project, tasks });
});
app.get('/api/projects/:projectId/members', requireAuth, ownedProject, (req, res) => res.json({ members: db.prepare('SELECT u.id,u.name,u.email,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY CASE pm.role WHEN \'owner\' THEN 0 ELSE 1 END,u.name').all(req.project.id) }));
app.post('/api/projects/:projectId/members', requireAuth, ownedProject, (req, res) => {
  if (req.project.user_id !== req.user.id) return res.status(403).json({ error: 'Only the project owner can invite collaborators.' });
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const invitee = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!invitee) return res.status(404).json({ error: 'Create an account first, then invite them with that email.' });
  db.prepare('INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?,?)').run(req.project.id,invitee.id,'member');
  res.status(201).json({ members: db.prepare('SELECT u.id,u.name,u.email,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY CASE pm.role WHEN \'owner\' THEN 0 ELSE 1 END,u.name').all(req.project.id) });
});
app.post('/api/projects/:projectId/tasks', requireAuth, ownedProject, (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const status = ['todo','inprogress','done'].includes(req.body.status) ? req.body.status : 'todo';
  const priority = ['low','medium','high'].includes(req.body.priority) ? req.body.priority : 'medium';
  const assignee = typeof req.body.assignee === 'string' ? req.body.assignee.trim().slice(0,60) : '';
  const dueDate = typeof req.body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate) ? req.body.dueDate : '';
  if (title.length < 2 || title.length > 120 || description.length > 500) return res.status(400).json({ error: 'Task titles need 2–120 characters; descriptions can be up to 500.' });
  if (assignee && !db.prepare('SELECT 1 FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND u.name=?').get(req.project.id,assignee)) return res.status(400).json({ error: 'Choose a collaborator on this project.' });
  const result = db.prepare('INSERT INTO tasks (project_id,title,description,status,priority,assignee,due_date) VALUES (?,?,?,?,?,?,?)').run(req.project.id,title,description,status,priority,assignee,dueDate);
  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id=?').get(result.lastInsertRowid) });
});
app.patch('/api/projects/:projectId/tasks/:taskId', requireAuth, ownedProject, (req, res) => {
  const id = Number(req.params.taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project_id=?').get(id,req.project.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const title = req.body.title === undefined ? task.title : typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const status = req.body.status === undefined ? task.status : req.body.status;
  const priority = req.body.priority === undefined ? task.priority : req.body.priority;
  const description = req.body.description === undefined ? task.description : typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const assignee = req.body.assignee === undefined ? task.assignee : typeof req.body.assignee === 'string' ? req.body.assignee.trim().slice(0,60) : '';
  const dueDate = req.body.dueDate === undefined ? task.due_date : typeof req.body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate) ? req.body.dueDate : '';
  if (title.length < 2 || title.length > 120 || !['todo','inprogress','done'].includes(status) || !['low','medium','high'].includes(priority) || description.length > 500) return res.status(400).json({ error: 'Check the task details and try again.' });
  if (assignee && !db.prepare('SELECT 1 FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND u.name=?').get(req.project.id,assignee)) return res.status(400).json({ error: 'Choose a collaborator on this project.' });
  db.prepare('UPDATE tasks SET title=?,description=?,status=?,priority=?,assignee=?,due_date=? WHERE id=?').run(title,description,status,priority,assignee,dueDate,id);
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id=?').get(id) });
});
app.delete('/api/projects/:projectId/tasks/:taskId', requireAuth, ownedProject, (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id=? AND project_id=?').run(Number(req.params.taskId),req.project.id);
  if (!result.changes) return res.status(404).json({ error: 'Task not found.' });
  res.json({ ok: true });
});
app.get('/api/projects/:projectId/tasks/:taskId/comments', requireAuth, ownedProject, (req, res) => {
  const task = db.prepare('SELECT id FROM tasks WHERE id=? AND project_id=?').get(Number(req.params.taskId),req.project.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ comments: db.prepare('SELECT c.id,c.body,c.created_at,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id').all(task.id) });
});
app.post('/api/projects/:projectId/tasks/:taskId/comments', requireAuth, ownedProject, (req, res) => {
  const task = db.prepare('SELECT id FROM tasks WHERE id=? AND project_id=?').get(Number(req.params.taskId),req.project.id);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (body.length < 1 || body.length > 500) return res.status(400).json({ error: 'Comments can be up to 500 characters.' });
  const result = db.prepare('INSERT INTO comments (task_id,user_id,body) VALUES (?,?,?)').run(task.id,req.user.id,body);
  res.status(201).json({ comment: db.prepare('SELECT c.id,c.body,c.created_at,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(result.lastInsertRowid) });
});

// Communication rooms retain only encrypted client payloads; the room key stays with participants.
const roomStreams = new Map();
function roomMember(req, res, next) {
  const roomId = Number(req.params.roomId);
  if (!Number.isInteger(roomId)) return res.status(400).json({ error: 'Choose a valid room.' });
  const room = db.prepare('SELECT r.* FROM comms_rooms r JOIN comms_members m ON m.room_id=r.id WHERE r.id=? AND m.user_id=?').get(roomId, req.user.id);
  if (!room) return res.status(404).json({ error: 'That room is not available to your account.' });
  req.room = room; next();
}
const roomOwnerIs = (room, userId) => Number(room.created_by) === Number(userId);
app.get('/api/comms/rooms', requireAuth, (req, res) => {
  const rooms = db.prepare('SELECT r.id,r.code,r.name,r.created_at,r.created_by,(r.created_by=?) AS is_owner,(SELECT COUNT(*) FROM comms_members m WHERE m.room_id=r.id) AS member_count FROM comms_rooms r JOIN comms_members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.id DESC').all(req.user.id,req.user.id);
  res.json({ rooms });
});
app.post('/api/comms/rooms', requireAuth, (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Room names need 2–80 characters.' });
  let code; do { code = crypto.randomBytes(6).toString('hex'); } while (db.prepare('SELECT 1 FROM comms_rooms WHERE code=?').get(code));
  const room = db.transaction(() => {
    const created = db.prepare('INSERT INTO comms_rooms (code,name,created_by) VALUES (?,?,?)').run(code,name,req.user.id);
    db.prepare('INSERT INTO comms_members (room_id,user_id) VALUES (?,?)').run(created.lastInsertRowid,req.user.id);
    return db.prepare('SELECT id,code,name,created_at FROM comms_rooms WHERE id=?').get(created.lastInsertRowid);
  })();
  res.status(201).json({ room });
});
app.post('/api/comms/rooms/join', requireAuth, (req, res) => {
  const code = typeof req.body.code === 'string' ? req.body.code.trim().toLowerCase() : '';
  const room = db.prepare('SELECT id,code,name,created_at FROM comms_rooms WHERE code=?').get(code);
  if (!room) return res.status(404).json({ error: 'Room code not found. Check it and try again.' });
  db.prepare('INSERT OR IGNORE INTO comms_members (room_id,user_id) VALUES (?,?)').run(room.id,req.user.id);
  res.json({ room });
});
app.delete('/api/comms/rooms/:roomId', requireAuth, (req, res) => {
  const roomId=Number(req.params.roomId);
  if(!Number.isInteger(roomId))return res.status(400).json({error:'Choose a valid room.'});
  const room=db.prepare('SELECT id,created_by FROM comms_rooms WHERE id=?').get(roomId);
  if(!room)return res.status(404).json({error:'That room has already been deleted.'});
  if(!roomOwnerIs(room,req.user.id))return res.status(403).json({error:'Only the room owner can delete it.'});
  roomStreams.get(roomId)?.forEach(writeEvent=>{writeEvent({room_deleted:true});writeEvent.close();});
  roomStreams.delete(roomId);
  db.prepare('DELETE FROM comms_rooms WHERE id=?').run(roomId);
  res.status(204).end();
});
app.delete('/api/comms/rooms/:roomId/members/:userId', requireAuth, roomMember, (req, res) => {
  if(!roomOwnerIs(req.room,req.user.id))return res.status(403).json({error:'Only the room owner can remove members.'});
  const targetId=Number(req.params.userId);
  if(!Number.isInteger(targetId)||targetId===req.user.id)return res.status(400).json({error:'Choose another room member to remove.'});
  const target=db.prepare('SELECT u.id,u.name FROM comms_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.user_id=?').get(req.room.id,targetId);
  if(!target)return res.status(404).json({error:'That person is no longer in this room.'});
  let code;do{code=crypto.randomBytes(6).toString('hex');}while(db.prepare('SELECT 1 FROM comms_rooms WHERE code=?').get(code));
  db.transaction(()=>{db.prepare('DELETE FROM comms_members WHERE room_id=? AND user_id=?').run(req.room.id,targetId);db.prepare('UPDATE comms_rooms SET code=? WHERE id=?').run(code,req.room.id);})();
  const streams=roomStreams.get(req.room.id);
  streams?.forEach(writeEvent=>writeEvent({room_removed:true,reason:'kicked',user_id:targetId,author:target.name}));
  streams?.forEach(writeEvent=>{if(Number(writeEvent.userId)!==targetId)writeEvent({room_code_rotated:true,room_id:req.room.id,code});});
  streams?.forEach(writeEvent=>{if(Number(writeEvent.userId)===targetId)writeEvent.close();});
  res.json({removed:target,room:{id:req.room.id,code}});
});
app.post('/api/comms/rooms/:roomId/leave', requireAuth, roomMember, (req, res) => {
  const room=req.room,wasOwner=roomOwnerIs(room,req.user.id);
  const remaining=db.prepare('SELECT m.user_id,u.name FROM comms_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.user_id<>? ORDER BY m.joined_at,m.user_id').all(room.id,req.user.id);
  if(wasOwner&&!remaining.length){roomStreams.get(room.id)?.forEach(writeEvent=>{writeEvent({room_deleted:true});writeEvent.close();});roomStreams.delete(room.id);db.prepare('DELETE FROM comms_rooms WHERE id=?').run(room.id);return res.json({left:true,deleted:true});}
  let nextOwner=null,newCode=null;
  if(wasOwner){nextOwner=remaining[0];do{newCode=crypto.randomBytes(6).toString('hex');}while(db.prepare('SELECT 1 FROM comms_rooms WHERE code=?').get(newCode));}
  db.transaction(()=>{if(nextOwner)db.prepare('UPDATE comms_rooms SET created_by=?,code=? WHERE id=?').run(nextOwner.user_id,newCode,room.id);db.prepare('DELETE FROM comms_members WHERE room_id=? AND user_id=?').run(room.id,req.user.id);})();
  const streams=roomStreams.get(room.id);
  streams?.forEach(writeEvent=>writeEvent({room_removed:true,reason:'left',user_id:req.user.id,author:req.user.name}));
  streams?.forEach(writeEvent=>{if(Number(writeEvent.userId)!==Number(req.user.id)&&nextOwner){writeEvent({room_owner_changed:true,room_id:room.id,owner_id:nextOwner.user_id});writeEvent({room_code_rotated:true,room_id:room.id,code:newCode});}});
  streams?.forEach(writeEvent=>{if(Number(writeEvent.userId)===Number(req.user.id))writeEvent.close();});
  res.json({left:true,deleted:false,transferredTo:nextOwner?{id:nextOwner.user_id,name:nextOwner.name}:null,code:newCode});
});
app.get('/api/comms/rooms/:roomId/members', requireAuth, roomMember, (req, res) => {
  const members = db.prepare('SELECT u.id,u.name,m.joined_at FROM comms_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY u.name').all(req.room.id);
  res.json({ members, is_owner:roomOwnerIs(req.room,req.user.id), owner_id:Number(req.room.created_by) });
});
app.get('/api/comms/rooms/:roomId/events', requireAuth, roomMember, (req, res) => {
  const after = Math.max(0, Number(req.query.after) || 0);
  const events = db.prepare('SELECT e.id,e.kind,e.payload,e.created_at,e.user_id,u.name AS author FROM comms_events e JOIN users u ON u.id=e.user_id WHERE e.room_id=? AND e.id>? ORDER BY e.id LIMIT 120').all(req.room.id,after);
  res.json({ events });
});
app.get('/api/comms/rooms/:roomId/stream', requireAuth, roomMember, (req, res) => {
  const after = Math.max(0, Number(req.query.after) || 0);
  res.status(200).set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive', 'X-Accel-Buffering':'no' });
  res.flushHeaders?.();
  const writeEvent = event => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  writeEvent.userId=req.user.id;
  writeEvent.close=()=>{if(!res.writableEnded)res.end();};
  // Replay first, then subscribe synchronously so no room event can fall between the two.
  const history = db.prepare('SELECT e.id,e.kind,e.payload,e.created_at,e.user_id,u.name AS author FROM comms_events e JOIN users u ON u.id=e.user_id WHERE e.room_id=? AND e.id>? ORDER BY e.id LIMIT 120').all(req.room.id,after);
  history.forEach(writeEvent);
  if (history.length === 120) return res.end();
  let streams = roomStreams.get(req.room.id);
  if (!streams) { streams = new Set(); roomStreams.set(req.room.id,streams); }
  streams.add(writeEvent);
  writeEvent({kind:'stream-ready'});
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': still here\n\n'); },20_000);
  res.on('close', () => { clearInterval(heartbeat); streams.delete(writeEvent); if (!streams.size) roomStreams.delete(req.room.id); });
});
app.post('/api/comms/rooms/:roomId/signals', requireAuth, roomMember, (req, res) => {
  const payload=req.body.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return res.status(400).json({error:'Call signal is invalid.'});
  const serialized=JSON.stringify(payload);
  if(serialized.length>200_000)return res.status(413).json({error:'Call signal is too large.'});
  const event={kind:'signal',payload:serialized,user_id:req.user.id,author:req.user.name,created_at:new Date().toISOString()};
  roomStreams.get(req.room.id)?.forEach(writeEvent=>writeEvent(event));
  res.status(204).end();
});
app.post('/api/comms/rooms/:roomId/events', requireAuth, roomMember, (req, res) => {
  const kind = req.body.kind;
  const payload = typeof req.body.payload === 'string' ? req.body.payload : '';
  if (!['message','file','board','signal'].includes(kind)) return res.status(400).json({ error: 'That room item is not supported.' });
  if (!payload.length || payload.length > 1_450_000) return res.status(413).json({ error: 'That item is too large to share. Try a smaller file.' });
  const created = db.prepare('INSERT INTO comms_events (room_id,user_id,kind,payload) VALUES (?,?,?,?)').run(req.room.id,req.user.id,kind,payload);
  const event = db.prepare('SELECT e.id,e.kind,e.payload,e.created_at,e.user_id,u.name AS author FROM comms_events e JOIN users u ON u.id=e.user_id WHERE e.id=?').get(created.lastInsertRowid);
  roomStreams.get(req.room.id)?.forEach(writeEvent => writeEvent(event));
  res.status(201).json({ id: Number(created.lastInsertRowid) });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Not found.');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname,'public','index.html'), err => err && next(err));
});
app.listen(port, () => console.log(`Object Department is ready at http://localhost:${port}`));
