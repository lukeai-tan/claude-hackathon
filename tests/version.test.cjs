const {test}=require('node:test');
const assert=require('node:assert/strict');
const root=require('../package.json');
test('every manifest carries the single suite version',()=>{
 const lock=require('../source-code/OpenSlides/package-lock.json');
 const versions={
  'OpenSlides/package.json':require('../source-code/OpenSlides/package.json').version,
  'OpenSlides/desktop/package.json':require('../source-code/OpenSlides/desktop/package.json').version,
  'OpenSlides/package-lock.json':lock.version,
  'OpenSlides/package-lock.json packages[""]':lock.packages[''].version,
  'OpenSlides/desktop/builder.cjs':require('../source-code/OpenSlides/desktop/builder.cjs').extraMetadata.version,
 };
 for(const [file,version] of Object.entries(versions))assert.equal(version,root.version,file+' is out of sync; run `npm run version:sync`');
});
