#!/bin/zsh
# Flat-vector sprite pipeline. Run from the repo root.
#
#   concepts/vector/ship.sh key  <raw.png> <source.png> [bg]
#       Key out the flat background (default #FF00FF), trim, and keep the full-size source.
#   concepts/vector/ship.sh ship <source.png> <sprite.png> <worldWidth> [outer] [inner]
#       Thicken the outline and ship at 2x world size (the game draws it at ART_SCALE 0.5).
#       outer: outline added around the silhouette, in world px (default 1.5).
#       inner: extra weight on interior ink lines, in world px (default 0.4).
#   concepts/vector/ship.sh flash <sprite.png> <flash.png>
#       White hit-flash silhouette of a shipped sprite.
#
# The generator draws thin outlines that vanish at 30-50 px, so the weight is added here, evenly
# for every sprite: dark ink lines are dilated, then a solid ink rim is grown around the alpha.
# The work happens at 8x world size and is downscaled to 2x with Lanczos.
set -e
INK="#151a15"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

case "$1" in
  key)
    bg=${4:-"#FF00FF"}
    if [[ "$bg" == "#FF00FF" ]]; then
      magick "$2" -alpha set -fuzz 18% -transparent "$bg" \
        -channel RGB -fx "(r>0.35&&b>0.35&&g<0.25)?0:u" +channel "$TMP/k.png"
    else
      magick "$2" -alpha set -fuzz 12% -transparent "$bg" "$TMP/k.png"
    fi
    # Trim to the art, ignoring stray specks (generator marks) that would hold the box open.
    box=$(magick "$TMP/k.png" -alpha extract -threshold 50% -morphology Open Disk:4 -format "%@" info:)
    magick "$TMP/k.png" -crop "$box" +repage "$3"
    ;;
  ship)
    src=$2 out=$3 w=$4 outer=${5:-1.5} inner=${6:-0.4}
    big=$((w * 8))
    # Pad so the grown rim has room, then work at 8x world size.
    magick "$src" -filter Lanczos -resize "${big}x" -bordercolor none -border 40 "$TMP/a.png"
    magick "$TMP/a.png" -alpha extract "$TMP/alpha.png"
    ri=$(printf "%.1f" $((inner * 8 / 2)))
    re=$(printf "%.1f" $((outer * 8)))
    # Ink mask: near-black pixels inside the shape, grown by half the extra interior weight.
    magick "$TMP/a.png" -alpha off -colorspace gray -threshold 14% -negate \
      "$TMP/alpha.png" -compose multiply -composite \
      -morphology Dilate "Disk:$ri" "$TMP/ink.png"
    size=$(magick identify -format "%wx%h" "$TMP/a.png")
    magick "$TMP/a.png" \( -size "$size" xc:"$INK" "$TMP/ink.png" -alpha off -compose CopyOpacity -composite \) \
      -compose over -composite "$TMP/b.png"
    # Outer rim: the silhouette grown by the outline width, filled with ink, under the art.
    magick "$TMP/alpha.png" -morphology Dilate "Disk:$re" -blur 0x1 "$TMP/rim.png"
    magick \( -size "$size" xc:"$INK" "$TMP/rim.png" -alpha off -compose CopyOpacity -composite \) \
      "$TMP/b.png" -compose over -composite -trim +repage \
      -filter Lanczos -resize 25% "$out"
    ;;
  flash)
    magick "$2" -channel RGB -fill white -colorize 100 +channel "$3"
    ;;
  *)
    echo "usage: ship.sh key|ship|flash ..." >&2
    exit 1
    ;;
esac
