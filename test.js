const bcrypt = require('bcrypt');

async function test() {
  const password = "123456";
  const hash = await bcrypt.hash(password, 10);
  console.log("Hash generado:", hash);

  const match = await bcrypt.compare("123456", hash);
  console.log("BCRYPT MATCH:", match);
}

test();