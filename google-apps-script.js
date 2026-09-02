/**
 * FreeAdsPost - zero-cost MVP storage API for Google Sheets.
 *
 * Sheets used:
 *   Users: ID | Name | Email | Phone | Company Name | Password Hash | Created At | Last Active | Availability | Status
 *   Ads:   ID | Seller ID | Title | Category | Condition | Description | Price | Price Type | City | State | Image | Images JSON | Posted At | Status
 *
 * IMPORTANT:
 * - This version NEVER stores a plain-text password.
 * - Deploy as Web app: Execute as Me, Who has access: Anyone.
 * - Put the deployment URL in Vercel as GOOGLE_SHEET_WEBHOOK_URL.
 */

const USERS_SHEET = 'Users';
const ADS_SHEET = 'Ads';
const INACTIVITY_MS = 15 * 60 * 1000;

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function cleanEmail_(email) { return String(email || '').trim().toLowerCase(); }
function cleanPhone_(phone) { return String(phone || '').replace(/\s/g, ''); }
function now_() { return new Date().toISOString(); }

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) {
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function users_() {
  return sheet_(USERS_SHEET, ['ID','Name','Email','Phone','Company Name','Password Hash','Created At','Last Active','Availability','Status']);
}
function ads_() {
  return sheet_(ADS_SHEET, ['ID','Seller ID','Title','Category','Condition','Description','Price','Price Type','City','State','Image','Images JSON','Posted At','Status']);
}

function rows_(sheet) {
  const values = sheet.getDataRange().getValues();
  return values.length <= 1 ? [] : values.slice(1);
}

function userFromRow_(r) {
  return { id:String(r[0]), name:String(r[1] || ''), email:String(r[2] || ''), phone:String(r[3] || ''), companyName:String(r[4] || ''), passwordHash:String(r[5] || ''), createdAt:String(r[6] || ''), lastActiveAt:String(r[7] || '') || null, availabilityStatus:String(r[8] || 'away'), status:String(r[9] || 'active') };
}

function adFromRow_(r) {
  let images = [];
  try { images = r[11] ? JSON.parse(String(r[11])) : []; } catch (_) { images = r[11] ? [String(r[11])] : []; }
  return { id:String(r[0]), sellerId:String(r[1]), title:String(r[2] || ''), category:String(r[3] || ''), condition:String(r[4] || 'not-applicable'), description:String(r[5] || ''), price:String(r[6] || '0'), priceType:String(r[7] || 'fixed'), city:String(r[8] || ''), state:String(r[9] || ''), image:String(r[10] || ''), images, postedAt:String(r[12] || ''), status:String(r[13] || 'published') };
}

function findUser_(id) {
  return rows_(users_()).map(userFromRow_).find(u => u.id === String(id)) || null;
}
function findUserByEmail_(email) {
  const target = cleanEmail_(email);
  return rows_(users_()).map(userFromRow_).find(u => u.email.toLowerCase() === target) || null;
}
function findAd_(id) { return rows_(ads_()).map(adFromRow_).find(a => a.id === String(id)) || null; }

function updateUser_(user) {
  const s = users_();
  const values = s.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(user.id)) {
      s.getRange(i + 1, 1, 1, 10).setValues([[user.id,user.name,user.email,user.phone,user.companyName,user.passwordHash,user.createdAt,user.lastActiveAt || '',user.availabilityStatus || 'away',user.status || 'active']]);
      return user;
    }
  }
  return null;
}

function publicUser_(u) {
  return { id:u.id, name:u.name, email:u.email, phone:u.phone, companyName:u.companyName, availabilityStatus:u.availabilityStatus, lastActiveAt:u.lastActiveAt };
}

function available_(u) {
  if (!u || u.status !== 'active') return false;
  if (u.id && (u.id.startsWith('u-sample-') || u.id === 'u-demo-user')) return true;
  if (u.availabilityStatus !== 'available' || !u.lastActiveAt) return false;
  return Date.now() - new Date(u.lastActiveAt).getTime() <= INACTIVITY_MS;
}

function sellerSafeAd_(ad, seller) {
  const isAvailable = available_(seller);
  return { ...ad, sellerAvailable: isAvailable, seller: seller ? { id:seller.id, name:seller.name, companyName:seller.companyName || '' } : undefined };
}

function ensureSeed_() {
  const us = users_();
  const as = ads_();

  const demoUserId = 'u-demo-user';
  if (!findUser_(demoUserId) && !findUserByEmail_('user@example.com')) {
    us.appendRow([demoUserId, 'Demo User', 'user@example.com', '9876543210', 'Demo Enterprises', sha256_('password123'), now_(), now_(), 'available', 'active']);
  }

  if (rows_(as).length > 0) return;

  const samples = [
    ['s1','2BHK Apartment for Rent – Bandra West','real-estate','not-applicable','Spacious 2BHK apartment available for rent in Bandra West. Fully furnished with modular kitchen, 2 bathrooms, parking. Close to station and market.','35000','negotiable','Mumbai','Maharashtra'],
    ['s2','Honda City 2020 – Excellent Condition','vehicles','good','Selling my Honda City 2020 petrol model. Single owner, all service records available, new tyres, company fitted accessories. 40,000 km driven.','850000','negotiable','Pune','Maharashtra'],
    ['s3','Full Stack Developer Required – Remote','jobs','not-applicable','We are hiring an experienced Full Stack Developer (React + Node.js). Min 2 years experience. Work from home. Salary 6–12 LPA based on experience.','0','contact','Bangalore','Karnataka'],
    ['s4','iPhone 14 Pro 256GB – Deep Purple','electronics','like-new','iPhone 14 Pro 256GB in Deep Purple. Purchased 6 months ago, always kept in cover with screen guard. Battery health 97%.','75000','fixed','Delhi','Delhi'],
    ['s5','Teak Wood Sofa Set – 3+1+1 Seater','furniture','good','Beautiful teak wood sofa set in good condition. 3 seater + 2 single seaters. Cushions recently replaced.','18000','negotiable','Chennai','Tamil Nadu'],
    ['s6','Yoga & Fitness Classes – Beginner to Advanced','services','not-applicable','Certified yoga instructor offering classes at home or online. Batch timings: 6AM, 7AM, 6PM.','1500','fixed','Hyderabad','Telangana'],
    ['s7','Golden Retriever Puppies Available','pets','not-applicable','Adorable Golden Retriever puppies, vaccinated and dewormed. Serious buyers only.','25000','fixed','Jaipur','Rajasthan'],
    ['s8','Class 10–12 Math & Science Tuition','education','not-applicable','Experienced tutor offering classes for CBSE/ICSE students. Math, Physics, Chemistry. Home tuition or online.','2500','negotiable','Kolkata','West Bengal']
  ];
  const now = Date.now();
  samples.forEach((x, i) => {
    const sellerId = 'u-sample-' + (i + 1);
    const email = 'seller' + (i + 1) + '@demo.freeadspost';
    if (!findUser_(sellerId)) us.appendRow([sellerId, x[1].split('–')[0].trim(), email, '', '', sha256_('demo12345'), new Date(now - i * 86400000).toISOString(), now_(), 'available', 'active']);
    as.appendRow([x[0], sellerId, x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8], '', '[]', new Date(now - (i + 1) * 86400000).toISOString(), 'published']);
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(p.action || '');
    ensureSeed_();

    if (action === 'health') return json_({status:'success', storage:'google-sheets'});

    if (action === 'register') {
      const name = String(p.name || '').trim();
      const email = cleanEmail_(p.email);
      const phone = cleanPhone_(p.phone);
      const password = String(p.password || '');
      if (!name || !email || !phone || !password) throw new Error('Name, email, phone and password are required');
      if (!/^\d{7,15}$/.test(phone)) throw new Error('Invalid phone number format');
      if (password.length < 6) throw new Error('Password must be at least 6 characters');
      if (findUserByEmail_(email)) { const err = new Error('An account with this email already exists'); err.code = 409; throw err; }
      const user = { id:'u-' + Utilities.getUuid(), name, email, phone, companyName:String(p.companyName || '').trim(), passwordHash:sha256_(password), createdAt:now_(), lastActiveAt:now_(), availabilityStatus:'available', status:'active' };
      users_().appendRow([user.id,user.name,user.email,user.phone,user.companyName,user.passwordHash,user.createdAt,user.lastActiveAt,user.availabilityStatus,user.status]);
      return json_({status:'success', user:publicUser_(user)});
    }

    if (action === 'login') {
      const user = findUserByEmail_(p.email);
      if (!user || user.passwordHash !== sha256_(p.password)) { const err = new Error('Invalid email or password'); err.code = 401; throw err; }
      user.lastActiveAt = now_(); user.availabilityStatus = 'available'; updateUser_(user);
      return json_({status:'success', user:publicUser_(user)});
    }

    if (['activity','availability','logout'].includes(action)) {
      const user = findUser_(p.userId);
      if (!user) { const err = new Error('Seller account not found'); err.code = 401; throw err; }
      if (action === 'activity') { user.lastActiveAt = now_(); user.availabilityStatus = 'available'; }
      if (action === 'availability') { user.lastActiveAt = now_(); user.availabilityStatus = p.available ? 'available' : 'away'; }
      if (action === 'logout') { user.lastActiveAt = now_(); user.availabilityStatus = 'away'; }
      updateUser_(user);
      return json_({status:'success', user:publicUser_(user)});
    }

    if (action === 'getAds') {
      const all = rows_(ads_()).map(adFromRow_);
      const users = rows_(users_()).map(userFromRow_);
      const byId = Object.fromEntries(users.map(u => [u.id, u]));
      const visible = all.filter(a => a.status !== 'sold' && a.status !== 'paused' && byId[a.sellerId] && byId[a.sellerId].status === 'active');
      return json_({status:'success', ads:visible.map(a => sellerSafeAd_(a, byId[a.sellerId]))});
    }

    if (action === 'getAd') {
      const ad = findAd_(p.id);
      const seller = ad ? findUser_(ad.sellerId) : null;
      if (!ad || !seller || seller.status !== 'active' || ['sold','paused'].includes(ad.status)) { const err = new Error('Ad is currently unavailable'); err.code = 404; throw err; }
      const loggedIn = !!p.viewerUserId && !!findUser_(p.viewerUserId);
      const result = sellerSafeAd_(ad, seller);
      if (loggedIn) result.seller = { id:seller.id, name:seller.name, companyName:seller.companyName || '', phone:seller.phone || '', email:seller.email || '' };
      return json_({status:'success', ad:result});
    }

    if (action === 'createAd') {
      const seller = findUser_(p.userId);
      if (!seller) { const err = new Error('Seller account not found'); err.code = 401; throw err; }
      const title = String(p.title || '').trim(), description = String(p.description || '').trim(), city = String(p.city || '').trim();
      if (!title || !p.category || !description || !city) throw new Error('Title, category, description and city are required');
      const imageList = Array.isArray(p.images) ? p.images.filter(Boolean).map(String) : (p.image ? [String(p.image)] : []);
      const ad = { id:'ad-' + Utilities.getUuid(), sellerId:seller.id, title, category:String(p.category), condition:String(p.condition || 'not-applicable'), description, price:String(p.price || '0'), priceType:String(p.priceType || 'fixed'), city, state:String(p.state || '').trim(), image:imageList[0] || '', images:imageList, postedAt:now_(), status:'published' };
      ads_().appendRow([ad.id,ad.sellerId,ad.title,ad.category,ad.condition,ad.description,ad.price,ad.priceType,ad.city,ad.state,ad.image,JSON.stringify(ad.images),ad.postedAt,ad.status]);
      return json_({status:'success', ad});
    }

    if (action === 'myAds') {
      const user = findUser_(p.userId);
      if (!user) { const err = new Error('Seller account not found'); err.code = 401; throw err; }
      return json_({status:'success', ads:rows_(ads_()).map(adFromRow_).filter(a => a.sellerId === user.id)});
    }

    if (action === 'deleteAd') {
      const ad = findAd_(p.id);
      if (!ad) { const err = new Error('Ad not found'); err.code = 404; throw err; }
      if (ad.sellerId !== String(p.userId)) { const err = new Error('You can only delete your own ads'); err.code = 403; throw err; }
      const s = ads_(), values = s.getDataRange().getValues();
      for (let i = values.length - 1; i >= 1; i--) if (String(values[i][0]) === String(p.id)) s.deleteRow(i + 1);
      return json_({status:'success', message:'Ad deleted successfully'});
    }

    throw new Error('Unknown action');
  } catch (err) {
    return json_({status:'error', error:String(err.message || err), code:err.code || 500});
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet() { return json_({status:'ok', message:'FreeAdsPost storage API is active'}); }
