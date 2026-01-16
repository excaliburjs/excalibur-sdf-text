# Excalibur SDF Text and Atlas Generation Plugin 

`@excaliburjs/sdf-text`

2 parts
1. vite (unplugin) for prebaking sdf atlas' during build time given a ttf file
2. Excalibur browser component for rendering SDF text into a game


## TODO

* [ ] Parallel processing with web workers and offscreen canvas
* [ ] Bin packing for the atlas
* [ ] Experiment with an excalibur plugin system
  - Install renderer
  - Install system
  - 
* [ ] SDFTextRenderer Build an SDF text renderer for excalibur
* [ ] SDFAtlasBuilder/SDFFont Build a vite plugin (unplugin) that can run in node to build sdf atlas'
* [ ] SDFTextGraphic Pair the atlas with a resource type that can load the atlas


