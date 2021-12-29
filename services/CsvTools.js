const fs = require("fs");

/***
 * Pulls CSV from file system at a given path
 * @param pathToCSV
 * @returns {Promise}
 */
exports.getCSV = (pathToCSV) => {
  return new Promise((resolve, reject) => {
    const stream = fs.readFile(pathToCSV, "utf8", (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
};

/***
 * Converts a .csv snapshot into an array of JSON objects in the format {account, amount}
 * @param csv
 * @returns {Array}
 */
exports.csvToJson = (csv) => {
  const arr = csv.split("\n");

  let tupled = [];

  //   Fix bad format
  arr.map((e) => {
    e = JSON.parse(
      e
        .replace(/([\w]+)(:)/g, '"$1"$2')
        .replace(/(},])/g, "}]")
        .trim()
        .slice(0, -1)
    );

    tupled.push(e);
  });

  return tupled;
};
