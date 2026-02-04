const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('OK DESDE SERVER TEST');
});

app.listen(3000, () => {
  console.log('SERVER TEST ESCUCHANDO EN 3000');
});