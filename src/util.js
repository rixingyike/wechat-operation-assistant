const jsonfile = require('jsonfile')
const path = require('path')

function readFile(file){
  let res = jsonfile.readFileSync(path.resolve(`./${file}`))
  return res 
}

function writeFile(file,obj){
  jsonfile.writeFileSync(path.resolve(`./${file}`), obj, { spaces: 2, finalEOL: false })
}

module.exports = {
  readFile,
  writeFile
}