#version 300 es
in vec2 a_position;

in vec2 a_uv;
out vec2 v_uv;

in vec4 a_color;
out vec4 v_color;

in lowp float a_textureIndex;
out lowp float v_textureIndex;

uniform mat4 u_matrix;

void main(){
  gl_Position = u_matrix * vec4(a_position, 0., 1.);

  v_uv = a_uv;

  v_color = a_color;

  v_textureIndex = a_textureIndex;
}
