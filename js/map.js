// ========== CLIENT CODE ========== //
// Hiển thị tên người dùng từ localStorage
const username = localStorage.getItem("username");
if (username) {
  const displayUsername = document.getElementById("displayUsername");
  if (displayUsername) {
    displayUsername.textContent = username;
  }
}

const map = L.map('map').setView([21.0285, 105.8542], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// ✅ Lấy vị trí chính xác và gắn marker
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    function (position) {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      
      console.log("📍 Tọa độ người dùng:", userLat, userLng); // 👈 kiểm tra tọa độ thực tế

      const userMarker = L.marker([userLat, userLng], {
        icon: L.icon({
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/64/64113.png',
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -30]
        })
      }).addTo(map);
      userMarker.bindPopup("📍 Vị trí của bạn").openPopup();
      map.setView([userLat, userLng], 13);
    },
    function (error) {
      console.error("❌ Lỗi khi lấy vị trí người dùng:", error);
      alert("⚠️ Không thể lấy vị trí chính xác. Vui lòng thử dùng điện thoại hoặc kết nối Wi-Fi để định vị tốt hơn.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
} else {
  alert("⚠️ Trình duyệt của bạn không hỗ trợ định vị.");
}

const searchInput = document.getElementById("search-input");
const filterQuan = document.getElementById("filter-quan");
const stadiumList = document.getElementById("stadium-list");

function clearMapMarkers() {
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });
}

function loadStadiums() {
  const quan = filterQuan.value;
  const keyword = searchInput.value.trim();

  if (!quan && !keyword) {
    stadiumList.innerHTML = "";
    clearMapMarkers();
    stadiumList.style.display = "none";
    return;
  }

  const url = new URL("http://localhost:3000/api/sanbong");
  if (quan) url.searchParams.append("quan", quan);
  if (keyword) url.searchParams.append("keyword", keyword);

  fetch(url)
    .then(res => res.json())
    .then(data => {
      stadiumList.innerHTML = "";
      clearMapMarkers();

      if (data.length > 0) {
        stadiumList.style.display = "block";
        data.forEach(san => {
          if (!san.latitude || !san.longitude) return;

          const marker = L.marker([san.latitude, san.longitude]).addTo(map);
          marker.bindPopup(`
            <b>${san.ten_san}</b><br>
            🏠 ${san.dia_chi}<br>
            📞 ${san.hotline}<br>
            💰 ${san.gia_thue_s || 'Không rõ'}<br>
            📌 <strong>Trạng thái: ${san.trang_thai || 'Chưa cập nhật'}</strong><br>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${san.latitude},${san.longitude}" target="_blank" style="color: blue; text-decoration: underline;">
              👉 Chỉ đường
            </a>
          `);

          const item = document.createElement("div");
          item.className = "stadium-item";
          item.innerHTML = `
            <strong>${san.ten_san}</strong><br>
            ${san.dia_chi}<br>
            <em>${san.hotline}</em>
            <em>Trạng thái: ${san.trang_thai || 'Chưa cập nhật'}</em>
          `;
          item.onclick = () => {
            map.setView([san.latitude, san.longitude], 16);
            marker.openPopup();
          };
          stadiumList.appendChild(item);
        });
      } else {
        stadiumList.style.display = "none";
      }
    })
    .catch(err => {
      console.error("❌ Lỗi tải sân bóng:", err);
    });
}

searchInput.addEventListener("input", loadStadiums);
filterQuan.addEventListener("change", loadStadiums);

document.getElementById("btn-refresh").addEventListener("click", () => {
  searchInput.value = "";
  filterQuan.value = "";
  stadiumList.innerHTML = "";
  clearMapMarkers();
  stadiumList.style.display = "none";
});

document.getElementById("btn-nearest").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Trình duyệt không hỗ trợ định vị.");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setView([latitude, longitude], 14);

    fetch(`http://localhost:3000/geojson/nearest?lat=${latitude}&lng=${longitude}`)
      .then(res => res.json())
      .then(data => {
        stadiumList.innerHTML = "";
        clearMapMarkers();
        stadiumList.style.display = "block";
        data.features.forEach(f => {
          const c = f.geometry.coordinates;
          const p = f.properties;
          const marker = L.marker([c[1], c[0]]).addTo(map);
          marker.bindPopup(`
            <b>${p.ten_san}</b><br>
            🏠 ${p.dia_chi}<br>
            📞 ${p.hotline}<br>
            💰 ${p.gia_thue_s || 'Không rõ'}<br>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${c[1]},${c[0]}" target="_blank" style="color: blue; text-decoration: underline;">
              👉 Chỉ đường
            </a>
          `);

          const item = document.createElement("div");
          item.className = "stadium-item";
          item.innerHTML = `
            <strong>${p.ten_san}</strong><br>
            ${p.dia_chi}<br>
            <em>${p.hotline}</em>
          `;
          item.onclick = () => {
            map.setView([c[1], c[0]], 16);
            marker.openPopup();
          };
          stadiumList.appendChild(item);
        });
      });
  });
});

stadiumList.style.display = "none";
