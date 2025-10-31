const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Folder to save images (create 'uploads' folder)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  },
});

const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.PGDATABASE,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// ================== REGISTER ==================
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO inventory.users (username, password) VALUES ($1, $2) RETURNING *",
      [username, hashedPassword]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("Error in register:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ================== GET PRODUCTS ==================
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM inventory.products");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
// ================== LOGIN ==================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // invalid token
    req.user = user; // attach user to request
    next();
  });
}



const jwt = require("jsonwebtoken"); // add this at the top

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // find user by username
    const result = await pool.query(
      "SELECT * FROM inventory.users WHERE username = $1",
      [username]
    );
    console.log("result", result);

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "User not found ❌" });
    }

    const user = result.rows[0];

    // compare entered password with hashed password in DB
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("isMatch", isMatch);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password ❌" });
    }

    // generate token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    console.log("token", token);

    res.json({
      success: true,
      message: "Login successful ✅",
      token,
      user,
    });
  } catch (err) {
    console.error("Error in login:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//post api
app.post("/api/products", upload.single("image"), async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    console.log("Uploaded File:", req.file);

    const { name, category, description, price, stock } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name || !category || !price) {
      return res.status(400).json({ message: "Required fields missing!" });
    }

    const result = await pool.query(
      `INSERT INTO inventory.products (name, category, description, image, price, stock)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, category, description, image, price, stock]
    );
     const Products = await pool.query("SELECT * FROM inventory.products ORDER BY id ASC");
    res.status(200).json(Products.rows); 

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error inserting product:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

//get api
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM inventory.products ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


//update
// UPDATE PRODUCT
app.put("/api/products/:id", upload.single("image"), async (req, res) => {
     console.log("✅ UPDATE CALLED");
  console.log("PARAMS:", req.params);
  console.log("ID:", req.params.id);
  try {
    const { id } = req.params;
    
    const { name, category, description, price, stock, oldImage } = req.body;

    // If new image uploaded use it, else keep old one
    const image = req.file ? `/uploads/${req.file.filename}` : oldImage;

    const query = `
      UPDATE inventory.products
      SET name=$1, category=$2, description=$3, image=$4, price=$5, stock=$6
      WHERE id=$7
      RETURNING *;
    `;

    const values = [name, category, description, image, price, stock, id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      message: "✅ Product updated successfully",
      product: result.rows[0],
    });

  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Server Error" });
  }
});


app.delete("/api/loan/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM inventory.products WHERE id = $1 RETURNING *", [id]);
     const updatedProducts = await pool.query("SELECT * FROM inventory.products ORDER BY id ASC");
    res.status(200).json(updatedProducts.rows); 

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Loan not found" });
    }

    res.status(200).json({ message: "Loan deleted successfully", deletedLoan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting loan" });
  }})


app.get("/profile", authenticateToken, (req, res) => {
  res.json({ message: "Welcome! 🎉", user: req.user });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
