#version 300 es
precision mediump float;

in vec2 v_uv;

in vec4 v_color;

// Texture index
in lowp float v_textureIndex;

// Textures in the current draw
uniform sampler2D u_textures[%%count%%];

uniform float u_buffer;
uniform float u_gamma;

out vec4 fragColor;

void main(){
  float dist = 1.0;

  // GLSL is templated out to pick the right texture and set the vec4 color
  %%texture_picker%%

  float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
  fragColor = vec4(v_color.rgb, alpha * v_color.a);
  fragColor.rgb *= fragColor.a;
}
