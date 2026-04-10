const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function geohashEncode(latitude, longitude, precision = 5) {
    let isEven = true;
    const lat = [-90.0, 90.0];
    const lon = [-180.0, 180.0];
    let bit = 0;
    let ch = 0;
    let geohash = '';

    while (geohash.length < precision) {
        let mid;
        if (isEven) {
            mid = (lon[0] + lon[1]) / 2;
            if (longitude > mid) {
                ch |= (1 << (4 - bit));
                lon[0] = mid;
            } else {
                lon[1] = mid;
            }
        } else {
            mid = (lat[0] + lat[1]) / 2;
            if (latitude > mid) {
                ch |= (1 << (4 - bit));
                lat[0] = mid;
            } else {
                lat[1] = mid;
            }
        }

        isEven = !isEven;
        if (bit < 4) {
            bit++;
        } else {
            geohash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return geohash;
}

function getDriverRoom(lat, lng) {
    if (lat === undefined || lng === undefined || lat === null || lng === null) return null;
    const hash = geohashEncode(parseFloat(lat), parseFloat(lng), 5);
    return `drivers:${hash}`;
}

module.exports = { geohashEncode, getDriverRoom };
