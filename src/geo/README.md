Simplified boundaries for the Places map (loaded on demand, `code` = ISO 3166 code).

- `fr-regions.json`, `fr-departments.json`: from [france-geojson](https://github.com/gregoiredavid/france-geojson)
  (IGN / INSEE data, Licence Ouverte), codes `FR-ARA`, `FR-69`.
- `world.json`: [Natural Earth](https://www.naturalearthdata.com/) 1:110m countries (public domain), codes `FR`, `CA`.

Simplified with mapshaper (`-simplify 12% keep-shapes`, coordinates rounded).
