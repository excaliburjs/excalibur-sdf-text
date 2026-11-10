#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;
in lowp float v_textureIndex;

// Atlases in the current batch
uniform sampler2D u_textures[%%count%%];

// Distance at which a pixel counts as "inside" the glyph (0..1, atlas dependent)
uniform float u_buffer;
// Width of the antialiasing ramp around that edge
uniform float u_gamma;

out vec4 fragColor;

void main(){
  float dist = 1.0;

  // GLSL is templated out to pick the right texture by index
  %%texture_picker%%

  float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
  fragColor = vec4(v_color.rgb, alpha * v_color.a);
  // Excalibur expects premultiplied alpha
  fragColor.rgb *= fragColor.a;
}
