const express = require("express");
const app = express();
const port = 3000;
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

app.use(express.static("."));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "s3cret-key-2025",
    resave: false,
    saveUninitialized: true,
  })
);

// 💡 Tại đây: khai báo middleware kiểm tra phân quyền
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Bạn chưa đăng nhập" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).json({ error: "Bạn không có quyền admin" });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.user || !req.session.user.is_owner) {
    return res
      .status(403)
      .json({ error: "Chỉ chủ sân mới được phép thực hiện thao tác này" });
  }
  next();
}

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "san_bong",
  password: "admin",
  port: 5432,
});

// Đăng ký
app.post("/api/register", async (req, res) => {
  const { fullname, username, password } = req.body;
  if (!fullname || !username || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Vui lòng điền đầy đủ thông tin" });
  }

  const userExists = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );
  if (userExists.rows.length > 0) {
    return res
      .status(409)
      .json({ success: false, error: "Tên đăng nhập đã tồn tại" });
  }

  const hash = await bcrypt.hash(password, 10);
  const newUser = await pool.query(
    `INSERT INTO users (fullname, username, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, fullname, is_admin`,
    [fullname, username, hash, false]
  );

  res.status(201).json({ success: true, user: newUser.rows[0] });
});

// Đăng nhập
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const userQuery = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );
  if (userQuery.rows.length === 0) {
    return res
      .status(401)
      .json({ success: false, error: "Sai tài khoản hoặc mật khẩu" });
  }

  const user = userQuery.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, error: "Sai mật khẩu" });
  }

  req.session.user = {
    id: user.id,
    fullname: user.fullname,
    username: user.username,
    is_admin: !!user.is_admin,
    is_owner: !!user.is_owner,
  };

  res.json({ success: true, user: req.session.user });
});

// phân quyền
app.post("/api/phanquyen", async (req, res) => {
  const { username, role } = req.body;

  if (!req.session.user || !req.session.user.is_admin) {
    return res
      .status(403)
      .json({ success: false, error: "Bạn không có quyền" });
  }

  try {
    if (role === "owner") {
      await pool.query("UPDATE users SET is_owner = true WHERE username = $1", [
        username,
      ]);
    } else if (role === "admin") {
      await pool.query("UPDATE users SET is_admin = true WHERE username = $1", [
        username,
      ]);
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Vai trò không hợp lệ" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi phân quyền:", err);
    res.status(500).json({ success: false, error: "Lỗi máy chủ" });
  }
});

// Đăng xuất
app.get("/api/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Lấy thông tin user đã đăng nhập
app.get("/api/me", (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: "Chưa đăng nhập" });
  }
});

// Lấy danh sách sân bóng
app.get("/api/sanbong", async (req, res) => {
  try {
    const { quan, keyword } = req.query;
    let query = `SELECT * FROM san_bong WHERE 1=1`;
    const values = [];

    if (quan) {
      values.push(quan);
      query += ` AND unaccent(lower(dia_chi)) ILIKE '%' || unaccent(lower($${values.length})) || '%'`;
    }

    if (keyword) {
      values.push(keyword);
      query += ` AND (
        unaccent(lower(ten_san)) ILIKE '%' || unaccent(lower($${values.length})) || '%'
        OR unaccent(lower(dia_chi)) ILIKE '%' || unaccent(lower($${values.length})) || '%'
        OR hotline ILIKE '%' || $${values.length} || '%'
      )`;
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi truy vấn sân bóng:", err);
    res.status(500).json({ error: "Lỗi server khi truy vấn sân bóng" });
  }
});

// Lấy sân theo ID
app.get("/api/sanbong/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM san_bong WHERE id = $1", [id]);
  res.json(result.rows[0]);
});

// Cập nhật sân
app.put("/api/sanbong/:id", async (req, res) => {
  const { id } = req.params;
  const {
    ten_san,
    dia_chi,
    hotline,
    gia_thue_san,
    latitude,
    longitude,
    trang_thai,
  } = req.body;

  try {
    await pool.query(
      `
      UPDATE san_bong
      SET ten_san = $1,
          dia_chi = $2,
          hotline = $3,
          gia_thue_san = $4,
          latitude = $5,
          longitude = $6,
          trang_thai = $7,
          geom = ST_SetSRID(ST_MakePoint($6::numeric::double precision, $5::numeric::double precision), 4326)
      WHERE id = $8
    `,
      [
        ten_san,
        dia_chi,
        hotline,
        gia_thue_san,
        latitude,
        longitude,
        trang_thai,
        id,
      ]
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật sân:", error);
    res.status(500).send("Lỗi máy chủ");
  }
});

// Xoá sân
app.delete("/api/sanbong/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM san_bong WHERE id = $1", [id]);
  res.sendStatus(204);
});

// Thêm sân
app.post("/add-stadium", async (req, res) => {
  const { name, address, longitude, latitude, hotline, gia_thue_san, mo_ta } =
    req.body;

  try {
    const query = `
      INSERT INTO san_bong (
        ten_san, dia_chi, longitude, latitude, hotline, gia_thue_san, mo_ta, geom
      ) VALUES (
        $1, $2, $3::double precision, $4::double precision, $5, $6, $7,
        ST_SetSRID(ST_MakePoint($3::double precision, $4::double precision), 4326)
      );
    `;
    await pool.query(query, [
      name,
      address,
      longitude,
      latitude,
      hotline,
      gia_thue_san,
      mo_ta,
    ]);
    res.send(
      '<script>alert("✅ Thêm sân thành công!"); window.location.href="/home.html";</script>'
    );
  } catch (err) {
    console.error("❌ Lỗi thêm sân:", err);
    res.status(500).send("Lỗi thêm sân");
  }
});

// Tìm sân gần nhất
app.get("/geojson/nearest", async (req, res) => {
  const { lat, lng } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT *, ST_Distance(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        ST_SetSRID(ST_MakePoint($2, $1), 4326)
      ) AS distance
      FROM san_bong
      ORDER BY distance
      LIMIT 5;
    `,
      [lat, lng]
    );

    const geojson = {
      type: "FeatureCollection",
      features: result.rows.map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [row.longitude, row.latitude],
        },
        properties: {
          ten_san: row.ten_san,
          dia_chi: row.dia_chi,
          hotline: row.hotline,
          gia_thue_san: row.gia_thue_san,
        },
      })),
    };

    res.json(geojson);
  } catch (err) {
    console.error("❌ Lỗi tìm sân gần nhất:", err);
    res.status(500).json({ error: "Lỗi truy vấn" });
  }
});

app.listen(port, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${port}`);
});
