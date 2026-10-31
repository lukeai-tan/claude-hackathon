module.exports={
  appId:'org.deckforge.studio',productName:'OpenSlides',electronVersion:'45.2.1',
  directories:{output:'release'},
  files:['dist/**/*','desktop/main.cjs','desktop/preload.cjs','desktop/anthropic.cjs','package.json','LICENSE'],
  extraMetadata:{main:'desktop/main.cjs',version:'0.3.0',description:'Offline slide design studio with Claudia-powered elements and design agents',author:'OpenSlides contributors',dependencies:{}},
  asar:true,npmRebuild:false,
  win:{target:[{target:'nsis',arch:['x64']},{target:'portable',arch:['x64']}],icon:'public/icon-512.png',signAndEditExecutable:false},
  nsis:{oneClick:false,allowToChangeInstallationDirectory:true,artifactName:'OpenSlides-Setup-${version}-${arch}.${ext}'},
  portable:{artifactName:'OpenSlides-Portable-${version}-${arch}.${ext}'},
};
