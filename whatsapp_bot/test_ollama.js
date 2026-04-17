const axios = require('axios');
const url = 'http://localhost:11434/api/tags';
axios.get(url)
    .then(r => console.log("Success:", r.data))
    .catch(e => console.log("Fail:", e.message));
