import bcrypt from "bcryptjs";
console.log("Hash for admin123:", bcrypt.hashSync("admin123", 10));
