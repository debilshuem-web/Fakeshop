const API_URL = window.location.origin;
let currentCategory = 'Все';
let currentPage = 0;
const LIMIT = 20;
let isLoading = false;
let hasMore = true;
let cartItems = [];
let currentProductId = null;
let appliedPromo = null;
let selectedProductIds = [];
let adminTab = 'dashboard';
let isAdminMode = false;
const ADMIN_IDS = [1886614664, 8814572765];
const tg = window.Telegram?.WebApp || { initDataUnsafe: { user: { id: 0 } }, close: () => {}, ready: () => {} };
const USER_ID = tg.initDataUnsafe?.user?.id || 1886614664;
const USERNAME = tg.initDataUnsafe?.user?.username || 'guest';
const $ = (id) => document.getElementById(id);
const productsGrid = $('productsGrid');
const skeletonGrid = $('skeletonGrid');
const emptyState = $('emptyState');
const loadMoreContainer = $('loadMoreContainer');
const loadMoreBtn = $('loadMoreBtn');
const categoriesContainer = $('categoriesContainer');
const searchInput = $('searchInput');
const searchToggle = $('searchToggle');
const searchContainer = $('searchContainer');
const searchClear = $('searchClear');
const cartBtn = $('cartBtn');
const cartBadge = $('cartBadge');
const cartPanel = $('cartPanel');
const cartOverlay = $('cartOverlay');
const cartClose = $('cartClose');
const cartItemsContainer = $('cartItems');
const cartFooter = $('cartFooter');
const cartTotal = $('cartTotal');
const checkoutBtn = $('checkoutBtn');
const modalOverlay = $('modalOverlay');
const modalClose = $('modalClose');
const modalContent = $('modalContent');
const orderModalOverlay = $('orderModalOverlay');
const orderModalClose = $('orderModalClose');
const orderForm = $('orderForm');
const orderSuccess = $('orderSuccess');
const orderNumberText = $('orderNumberText');
const orderCloseBtn = $('orderCloseBtn');
const orderPhone = $('orderPhone');
const orderAddress = $('orderAddress');
const orderComment = $('orderComment');
const orderPromo = $('orderPromo');
const promoApplyBtn = $('promoApplyBtn');
const promoInfo = $('promoInfo');
const orderSubtotal = $('orderSubtotal');
const orderDiscount = $('orderDiscount');
const discountRow = $('discountRow');
const orderTotal = $('orderTotal');
const submitOrderBtn = $('submitOrderBtn');
const toast = $('toast');
const userMode = $('userMode');
const adminMode = $('adminMode');
const adminToggleBtn = $('adminToggleBtn');
const adminModeBadge = $('adminModeBadge');
let toastTimeout = null;

function showToast(message, type = 'info', duration = 3000) {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка запроса');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'Ошибка соединения', 'error');
        throw error;
    }
}

function isAdmin() {
    return ADMIN_IDS.includes(USER_ID);
}

function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    userMode.style.display = isAdminMode ? 'none' : 'block';
    adminMode.style.display = isAdminMode ? 'block' : 'none';
    adminModeBadge.style.display = isAdminMode ? 'inline' : 'none';
    adminToggleBtn.innerHTML = isAdminMode ? '<i class="fas fa-store"></i>' : '<i class="fas fa-crown"></i>';
    if (isAdminMode) {
        switchAdminTab('dashboard');
    }
}

async function loadCategories() {
    try {
        const categories = await apiRequest('/api/categories');
        categoriesContainer.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'category-btn active';
        allBtn.dataset.category = 'Все';
        allBtn.textContent = 'Все';
        allBtn.onclick = () => selectCategory('Все');
        categoriesContainer.appendChild(allBtn);
        categories.forEach(cat => {
            if (cat.name !== 'Все') {
                const btn = document.createElement('button');
                btn.className = 'category-btn';
                btn.dataset.category = cat.name;
                btn.textContent = cat.icon ? `${cat.icon} ${cat.name}` : cat.name;
                btn.onclick = () => selectCategory(cat.name);
                categoriesContainer.appendChild(btn);
            }
        });
        const adminCategoryFilter = $('adminCategoryFilter');
        const productCategory = $('productCategory');
        if (adminCategoryFilter) {
            adminCategoryFilter.innerHTML = '<option value="Все">Все категории</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                adminCategoryFilter.appendChild(opt);
            });
        }
        if (productCategory) {
            productCategory.innerHTML = '';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                productCategory.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

function selectCategory(category) {
    currentCategory = category;
    currentPage = 0;
    hasMore = true;
    productsGrid.innerHTML = '';
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    loadProducts(true);
}

async function loadProducts(reset = false) {
    if (isLoading) return;
    if (!hasMore && !reset) return;
    isLoading = true;
    if (reset) {
        currentPage = 0;
        hasMore = true;
        productsGrid.innerHTML = '';
        skeletonGrid.classList.remove('hidden');
    }
    try {
        const searchQuery = searchInput.value.trim();
        let url = `/api/products?limit=${LIMIT}&offset=${currentPage * LIMIT}`;
        if (currentCategory && currentCategory !== 'Все') {
            url += `&category=${encodeURIComponent(currentCategory)}`;
        }
        if (searchQuery) {
            url += `&search=${encodeURIComponent(searchQuery)}`;
        }
        const data = await apiRequest(url);
        skeletonGrid.classList.add('hidden');
        if (data.products.length === 0 && currentPage === 0) {
            emptyState.style.display = 'flex';
            productsGrid.classList.add('empty');
            loadMoreContainer.style.display = 'none';
            return;
        }
        emptyState.style.display = 'none';
        productsGrid.classList.remove('empty');
        data.products.forEach(product => {
            productsGrid.appendChild(createProductCard(product));
        });
        currentPage++;
        hasMore = data.products.length === LIMIT;
        loadMoreContainer.style.display = hasMore ? 'flex' : 'none';
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        skeletonGrid.classList.add('hidden');
        showToast('Не удалось загрузить товары', 'error');
    } finally {
        isLoading = false;
    }
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;
    const inStock = product.quantity > 0;
    const statusText = inStock ? `✅ Осталось ${product.quantity} шт. Не зевай, они не резиновые.` : '❌ Улетели. Бывает.';
    const statusClass = inStock ? 'product-status' : 'product-status out-of-stock';
    card.innerHTML = `
        <div class="product-image" onclick="openProduct(${product.id})">
            ${product.photo ? `<img src="${product.photo}" alt="${product.name}" loading="lazy">` : `<span class="placeholder-icon"><i class="fas fa-tshirt"></i></span>`}
            <span class="product-id-badge">🆔 #${product.id}</span>
            <button class="product-share-btn" onclick="event.stopPropagation(); shareProduct(${product.id})">
                <i class="fas fa-share-alt"></i>
            </button>
        </div>
        <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-price">${product.price} <small>BYN</small></div>
            <div class="${statusClass}">${statusText}</div>
            <div class="product-actions">
                <button class="product-action-btn btn-cart" onclick="event.stopPropagation(); addToCart(${product.id})">
                    <i class="fas fa-shopping-cart"></i> Забрать себе
                </button>
                <button class="product-action-btn btn-buy" onclick="event.stopPropagation(); buyNow(${product.id})">
                    <i class="fas fa-bolt"></i> Мне это надо
                </button>
            </div>
        </div>
    `;
    return card;
}

async function openProduct(productId) {
    try {
        const product = await apiRequest(`/api/products/${productId}`);
        currentProductId = productId;
        renderProductModal(product);
        modalOverlay.classList.add('open');
    } catch (error) {
        showToast('Не удалось загрузить товар', 'error');
    }
}

function renderProductModal(product) {
    const inStock = product.quantity > 0;
    const statusText = inStock ? `✅ Осталось ${product.quantity} шт. Не зевай, они не резиновые.` : '❌ Улетели. Бывает.';
    const statusClass = inStock ? 'modal-product-status' : 'modal-product-status out-of-stock';
    modalContent.innerHTML = `
        <div class="modal-product-id">🆔 #${product.id}</div>
        <div class="modal-product-image">
            ${product.photo ? `<img src="${product.photo}" alt="${product.name}">` : `<i class="fas fa-tshirt" style="font-size:60px;opacity:0.3;"></i>`}
        </div>
        <div class="modal-product-name">${escapeHtml(product.name)}</div>
        <div class="modal-product-price">${product.price} BYN</div>
        <div class="${statusClass}">${statusText}</div>
        ${product.note ? `<div class="modal-product-note">📌 ${escapeHtml(product.note)}</div>` : ''}
        <div class="modal-actions">
            <button class="product-action-btn btn-cart" onclick="addToCart(${product.id}); closeModal();">
                <i class="fas fa-shopping-cart"></i> Забрать себе
            </button>
            <button class="product-action-btn btn-buy" onclick="buyNow(${product.id}); closeModal();">
                <i class="fas fa-bolt"></i> Мне это надо
            </button>
        </div>
    `;
}

function closeModal() {
    modalOverlay.classList.remove('open');
}

function shareProduct(productId) {
    const shareUrl = `${window.location.origin}?start=product_${productId}`;
    const text = `🔥 Смотри, что нашел в FAKESHOP! 🛍️\n\nПереходи по ссылке: ${shareUrl}`;
    if (navigator.share) {
        navigator.share({
            title: 'FAKESHOP - Товар',
            text: text,
            url: shareUrl
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('🔗 Ссылка скопирована!', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('🔗 Ссылка скопирована!', 'success');
        });
    }
}

async function addToCart(productId, quantity = 1) {
    try {
        await apiRequest(`/api/cart/${USER_ID}`, {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity })
        });
        await loadCart();
        showToast('✅ Добавили. Ты уже на шаг ближе к идеальному образу.', 'success');
    } catch (error) {
        showToast(error.message || 'Ошибка добавления', 'error');
    }
}

async function loadCart() {
    try {
        const data = await apiRequest(`/api/cart/${USER_ID}`);
        cartItems = data.items || [];
        updateCartUI();
        return data;
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        return { items: [], total: 0 };
    }
}

function updateCartUI() {
    const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    cartBadge.textContent = count;
    cartBadge.style.display = count > 0 ? 'flex' : 'none';
    if (cartItems.length === 0) {
        cartItemsContainer.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>🧺 Пусто. Как моя голова по утрам.</p><p>Добавь что-нибудь, не стесняйся.</p></div>`;
        cartFooter.style.display = 'none';
        return;
    }
    let total = 0;
    cartItemsContainer.innerHTML = cartItems.map(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="cart-item" data-product-id="${item.product_id}">
                <div class="cart-item-image">
                    ${item.photo ? `<img src="${item.photo}" alt="${item.name}">` : `<i class="fas fa-tshirt"></i>`}
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${item.price} BYN</div>
                    <div class="cart-item-qty">
                        <button onclick="updateCartQty(${item.product_id}, -1)">−</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateCartQty(${item.product_id}, 1)">+</button>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }).join('');
    cartTotal.textContent = `${total} BYN`;
    cartFooter.style.display = 'block';
}

async function updateCartQty(productId, delta) {
    const item = cartItems.find(i => i.product_id === productId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        await removeFromCart(productId);
        return;
    }
    try {
        await apiRequest(`/api/cart/${USER_ID}/${productId}`, { method: 'DELETE' });
        await apiRequest(`/api/cart/${USER_ID}`, {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity: newQty })
        });
        await loadCart();
    } catch (error) {
        showToast('Ошибка обновления', 'error');
    }
}

async function removeFromCart(productId) {
    try {
        await apiRequest(`/api/cart/${USER_ID}/${productId}`, { method: 'DELETE' });
        await loadCart();
        showToast('🗑️ Убрали. Но ты ещё успеешь передумать.', 'info');
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

function openCart() {
    cartPanel.classList.add('open');
    cartOverlay.classList.add('open');
}

function closeCart() {
    cartPanel.classList.remove('open');
    cartOverlay.classList.remove('open');
}

async function buyNow(productId) {
    if (!confirm('⚡ Мне это надо?')) return;
    try {
        const product = await apiRequest(`/api/products/${productId}`);
        if (product.quantity <= 0) {
            showToast('❌ Улетели. Бывает.', 'error');
            return;
        }
        selectedProductIds = [productId];
        openOrderForm();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

function checkoutFromCart() {
    if (cartItems.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }
    selectedProductIds = cartItems.map(item => item.product_id);
    closeCart();
    openOrderForm();
}

function openOrderForm() {
    orderForm.style.display = 'block';
    orderSuccess.style.display = 'none';
    orderModalOverlay.classList.add('open');
    updateOrderSummary();
}

function closeOrderModal() {
    orderModalOverlay.classList.remove('open');
    appliedPromo = null;
    promoInfo.textContent = '';
    promoInfo.className = 'promo-info';
    orderPromo.value = '';
}

async function updateOrderSummary() {
    try {
        let total = 0;
        for (const pid of selectedProductIds) {
            const product = await apiRequest(`/api/products/${pid}`);
            total += product.price;
        }
        orderSubtotal.textContent = `${total} BYN`;
        let finalTotal = total;
        let discountAmount = 0;
        if (appliedPromo) {
            discountAmount = (total * appliedPromo.discount) / 100;
            finalTotal = total - discountAmount;
            discountRow.style.display = 'flex';
            orderDiscount.textContent = `-${discountAmount.toFixed(2)} BYN`;
        } else {
            discountRow.style.display = 'none';
        }
        orderTotal.textContent = `${finalTotal.toFixed(2)} BYN`;
    } catch (error) {
        console.error('Ошибка обновления суммы:', error);
    }
}

async function applyPromo() {
    const code = orderPromo.value.trim().toUpperCase();
    if (!code) {
        showToast('Введите промокод', 'error');
        return;
    }
    try {
        const total = parseFloat(orderSubtotal.textContent);
        const data = await apiRequest(`/api/promocodes/${code}/validate?total=${total}`, { method: 'POST' });
        appliedPromo = data;
        promoInfo.textContent = `✅ Промокод применен! Скидка ${data.discount}%`;
        promoInfo.className = 'promo-info';
        await updateOrderSummary();
        showToast('🎉 Промокод применен!', 'success');
    } catch (error) {
        promoInfo.textContent = `❌ ${error.message}`;
        promoInfo.className = 'promo-info error';
        appliedPromo = null;
    }
}

async function submitOrder() {
    const phone = orderPhone.value.trim();
    if (!phone) {
        showToast('Введите номер телефона', 'error');
        return;
    }
    if (selectedProductIds.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }
    const orderData = {
        user_id: USER_ID,
        username: USERNAME,
        first_name: tg.initDataUnsafe?.user?.first_name || '',
        last_name: tg.initDataUnsafe?.user?.last_name || '',
        phone: phone,
        address: orderAddress.value.trim(),
        contact: `@${USERNAME}`,
        promocode: appliedPromo ? appliedPromo.code : '',
        comment: orderComment.value.trim()
    };
    try {
        const result = await apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        orderForm.style.display = 'none';
        orderSuccess.style.display = 'block';
        orderNumberText.innerHTML = `Номер заказа: <strong>${result.order_number || '#' + result.order_id}</strong>`;
        await loadCart();
        showToast('✅ Заказ ушёл в обработку. Менеджер @ManaReaper свяжется с тобой.', 'success');
    } catch (error) {
        showToast(error.message || 'Ошибка оформления', 'error');
    }
}

function toggleSearch() {
    searchContainer.classList.toggle('open');
    if (searchContainer.classList.contains('open')) {
        searchInput.focus();
    }
}

function clearSearch() {
    searchInput.value = '';
    searchContainer.classList.remove('open');
    currentPage = 0;
    hasMore = true;
    productsGrid.innerHTML = '';
    loadProducts(true);
}

function loadMore() {
    loadProducts();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function switchAdminTab(tab) {
    adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn').forEach(el => el.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) targetTab.classList.add('active');
    const targetBtn = document.querySelector(`.admin-nav-btn[data-tab="${tab}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    switch (tab) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadAdminProducts();
            break;
        case 'categories':
            loadAdminCategories();
            break;
        case 'orders':
            loadAdminOrders();
            break;
        case 'promocodes':
            loadPromoCodes();
            break;
        case 'faq':
            loadFaq();
            break;
        case 'banned':
            loadBannedUsers();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'reviews':
            loadTelegramReviews();
            break;
    }
}

async function loadDashboard() {
    try {
        const stats = await apiRequest('/api/stats');
        const elements = {
            statProducts: stats.total_products || 0,
            statOrders: stats.total_orders || 0,
            statRevenue: `${stats.total_revenue || 0} BYN`,
            statUsers: stats.total_users || 0
        };
        Object.keys(elements).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = elements[id];
        });
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

async function loadAdminProducts() {
    const list = $('adminProductsList');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Загрузка...</div>';
    try {
        const search = $('adminSearchInput')?.value || '';
        const category = $('adminCategoryFilter')?.value || 'Все';
        let url = '/api/products?limit=100';
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (category && category !== 'Все') url += `&category=${encodeURIComponent(category)}`;
        const data = await apiRequest(url);
        const products = data.products || [];
        if (products.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Товаров не найдено</p></div>';
            return;
        }
        list.innerHTML = products.map(p => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">🆔 #${p.id} ${escapeHtml(p.name)}</div>
                    <div class="admin-list-item-sub">${p.price} BYN · ${p.quantity} шт · ${p.category || 'Все'} ${p.quantity > 0 ? '✅' : '❌'} ${p.from_china ? '🌏 Из Китая' : ''}</div>
                </div>
                <div class="admin-list-actions">
                    <button class="view-btn" onclick="openProduct(${p.id})" title="Карточка"><i class="fas fa-eye"></i></button>
                    <button class="edit-btn" onclick="editProduct(${p.id})" title="Изменить"><i class="fas fa-pen"></i></button>
                    <button class="delete-btn" onclick="deleteProduct(${p.id})" title="Удалить"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleProductForm() {
    const container = $('productFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (container.style.display === 'block') {
        $('productFormTitle').textContent = 'Новый товар';
        $('productName').value = '';
        $('productPrice').value = '';
        $('productQuantity').value = '';
        $('productCategory').value = 'Все';
        $('productPhoto').value = '';
        $('productNote').value = '';
        const chinaCheck = $('productFromChina');
        if (chinaCheck) chinaCheck.checked = false;
        $('productFormSubmit').dataset.productId = '';
        $('productFormSubmit').textContent = '✅ Сохранить';
    }
}

async function saveProduct() {
    const name = $('productName').value.trim();
    const price = parseFloat($('productPrice').value);
    const quantity = parseInt($('productQuantity').value);
    const category = $('productCategory').value;
    const photo = $('productPhoto').value.trim();
    const note = $('productNote').value.trim();
    const fromChina = $('productFromChina')?.checked ? 1 : 0;
    const editId = $('productFormSubmit').dataset.productId;
    if (!name || isNaN(price) || isNaN(quantity)) {
        showToast('Заполните обязательные поля', 'error');
        return;
    }
    const data = { name, price, quantity, category, photo, note, from_china: fromChina };
    try {
        if (editId) {
            await apiRequest(`/api/products/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
            showToast('✅ Товар обновлен', 'success');
        } else {
            await apiRequest('/api/products', { method: 'POST', body: JSON.stringify(data) });
            showToast('✅ Товар создан', 'success');
        }
        toggleProductForm();
        loadAdminProducts();
        loadProducts(true);
    } catch (error) {
        showToast(error.message || 'Ошибка сохранения', 'error');
    }
}

async function editProduct(id) {
    try {
        const product = await apiRequest(`/api/products/${id}`);
        toggleProductForm();
        $('productFormTitle').textContent = 'Редактировать товар';
        $('productName').value = product.name;
        $('productPrice').value = product.price;
        $('productQuantity').value = product.quantity;
        $('productCategory').value = product.category || 'Все';
        $('productPhoto').value = product.photo || '';
        $('productNote').value = product.note || '';
        const chinaCheck = $('productFromChina');
        if (chinaCheck) chinaCheck.checked = product.from_china == 1;
        $('productFormSubmit').dataset.productId = id;
        $('productFormSubmit').textContent = '💾 Обновить';
    } catch (error) {
        showToast('Ошибка загрузки товара', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('🗑️ Точно удалить товар #' + id + '?')) return;
    try {
        await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
        showToast('🗑️ Товар удален', 'info');
        loadAdminProducts();
        loadProducts(true);
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

async function loadAdminCategories() {
    const list = $('adminCategoriesList');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Загрузка...</div>';
    try {
        const categories = await apiRequest('/api/categories');
        if (categories.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Категорий нет</p></div>';
            return;
        }
        list.innerHTML = categories.map(c => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">${c.icon || '📁'} ${c.name}</div>
                    <div class="admin-list-item-sub">ID: ${c.id} · ${c.name !== 'Все' ? 'Можно удалить' : 'Системная'}</div>
                </div>
                ${c.name !== 'Все' ? `
                <div class="admin-list-actions">
                    <button class="edit-btn" onclick="editCategory(${c.id}, '${c.name}', '${c.icon || ''}')"><i class="fas fa-pen"></i></button>
                    <button class="delete-btn" onclick="deleteCategory(${c.id})"><i class="fas fa-trash"></i></button>
                </div>
                ` : `<span class="status-badge completed">Системная</span>`}
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleCategoryForm() {
    const container = $('categoryFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (container.style.display === 'block') {
        $('categoryName').value = '';
        $('categoryIcon').value = '';
        $('categoryFormSubmit').dataset.categoryId = '';
        $('categoryFormSubmit').textContent = '✅ Сохранить';
    }
}

async function saveCategory() {
    const name = $('categoryName').value.trim();
    const icon = $('categoryIcon').value.trim();
    const editId = $('categoryFormSubmit').dataset.categoryId;
    if (!name) {
        showToast('Введите название категории', 'error');
        return;
    }
    try {
        if (editId) {
            await apiRequest(`/api/categories/${editId}`, {
                method: 'PUT',
                body: JSON.stringify({ name, icon, user_id: USER_ID })
            });
            showToast('✅ Категория обновлена', 'success');
        } else {
            await apiRequest('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, icon, user_id: USER_ID })
            });
            showToast('✅ Категория создана', 'success');
        }
        toggleCategoryForm();
        loadAdminCategories();
        loadCategories();
    } catch (error) {
        showToast(error.message || 'Ошибка', 'error');
    }
}

function editCategory(id, name, icon) {
    toggleCategoryForm();
    $('categoryName').value = name;
    $('categoryIcon').value = icon;
    $('categoryFormSubmit').dataset.categoryId = id;
    $('categoryFormSubmit').textContent = '💾 Обновить';
}

async function deleteCategory(id) {
    if (!confirm('🗑️ Удалить категорию? Товары перенесутся в "Все".')) return;
    try {
        await apiRequest(`/api/categories/${id}?user_id=${USER_ID}`, { method: 'DELETE' });
        showToast('🗑️ Категория удалена', 'info');
        loadAdminCategories();
        loadCategories();
    } catch (error) {
        showToast(error.message || 'Ошибка удаления', 'error');
    }
}

async function loadAdminOrders() {
    const list = $('adminOrdersList');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Загрузка...</div>';
    try {
        const status = $('orderStatusFilter')?.value || 'all';
        let url = '/api/orders?limit=100';
        if (status !== 'all') url += `&status=${status}`;
        const orders = await apiRequest(url);
        if (orders.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Заявок нет</p></div>';
            return;
        }
        list.innerHTML = orders.map(o => {
            const statusMap = {
                'new': '🟢 Свежий заказ',
                'processing': '🟡 В работе (медленно, но верно)',
                'completed': '✅ Готово! Ты молодец.',
                'cancelled': '❌ Отменён. Бывает.'
            };
            return `
                <div class="admin-list-item">
                    <div class="admin-list-item-info">
                        <div class="admin-list-item-title">📦 ${o.order_number || '#' + o.id}</div>
                        <div class="admin-list-item-sub">👤 ${o.username || o.first_name || 'Гость'} · 📞 ${o.phone || '-'}</div>
                        <div class="admin-list-item-sub">💰 ${o.final_total || o.total} BYN</div>
                        <div class="admin-list-item-sub"><span class="status-badge ${o.status}">${statusMap[o.status] || o.status}</span> ${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</div>
                    </div>
                    <div class="admin-list-actions">
                        ${o.status !== 'completed' && o.status !== 'cancelled' ? `
                            <button class="edit-btn" onclick="acceptOrder(${o.id}, ${o.user_id})" title="Принять заказ"><i class="fas fa-check-circle"></i> Принять</button>
                        ` : ''}
                        <button class="delete-btn" onclick="deleteOrder(${o.id})" title="Удалить"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

async function acceptOrder(orderId, userId) {
    if (!confirm('✅ Принять заказ #' + orderId + ' и связаться с покупателем?')) return;
    try {
        await apiRequest(`/api/orders/${orderId}`, { method: 'DELETE' });
        if (userId && userId > 0) {
            window.open(`tg://user?id=${userId}`, '_blank');
        } else {
            window.open(`tg://resolve?domain=ManaReaper`, '_blank');
            showToast('⚠️ Нет ID покупателя. Свяжись с менеджером.', 'warning');
        }
        showToast('✅ Заказ принят! Чат с покупателем открыт.', 'success');
        loadAdminOrders();
    } catch (error) {
        showToast('❌ Ошибка при принятии заказа', 'error');
    }
}

async function deleteOrder(id) {
    if (!confirm('🗑️ Удалить заявку #' + id + '?')) return;
    try {
        await apiRequest(`/api/orders/${id}`, { method: 'DELETE' });
        showToast('🗑️ Заявка удалена', 'info');
        loadAdminOrders();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

async function loadPromoCodes() {
    const list = $('adminPromoCodes');
    if (!list) return;
    try {
        const data = await apiRequest('/api/promocodes');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Промокодов нет</p></div>';
            return;
        }
        list.innerHTML = data.map(p => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">🏷️ ${p.code}</div>
                    <div class="admin-list-item-sub">Скидка ${p.discount}% · Использован ${p.used_count || 0}/${p.uses_limit || '∞'} раз</div>
                </div>
                <div class="admin-list-actions">
                    <button class="delete-btn" onclick="deletePromo('${p.code}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function togglePromoForm() {
    const container = $('promoFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function savePromo() {
    const code = $('promoCode').value.trim().toUpperCase();
    const discount = parseInt($('promoDiscount').value);
    const min_order = parseFloat($('promoMinOrder').value) || 0;
    const uses_limit = parseInt($('promoUsesLimit').value) || 0;
    const expires_at = $('promoExpiresAt').value || null;
    if (!code || isNaN(discount)) {
        showToast('Заполните код и скидку', 'error');
        return;
    }
    try {
        await apiRequest('/api/promocodes', {
            method: 'POST',
            body: JSON.stringify({ code, discount, min_order, uses_limit, expires_at })
        });
        showToast('✅ Промокод создан', 'success');
        togglePromoForm();
        loadPromoCodes();
    } catch (error) {
        showToast(error.message || 'Ошибка', 'error');
    }
}

async function deletePromo(code) {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    try {
        await apiRequest(`/api/promocodes/${code}`, { method: 'DELETE' });
        showToast('🗑️ Промокод удален', 'info');
        loadPromoCodes();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

async function loadFaq() {
    const list = $('adminFaqList');
    if (!list) return;
    try {
        const data = await apiRequest('/api/faq');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>FAQ пуст</p></div>';
            return;
        }
        list.innerHTML = data.map(f => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">❓ ${escapeHtml(f.question)}</div>
                    <div class="admin-list-item-sub">${escapeHtml(f.answer)}</div>
                </div>
                <div class="admin-list-actions">
                    <button class="delete-btn" onclick="deleteFaq(${f.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

function toggleFaqForm() {
    const container = $('faqFormContainer');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function saveFaq() {
    const question = $('faqQuestion').value.trim();
    const answer = $('faqAnswer').value.trim();
    if (!question || !answer) {
        showToast('Заполните вопрос и ответ', 'error');
        return;
    }
    try {
        await apiRequest('/api/faq', {
            method: 'POST',
            body: JSON.stringify({ question, answer })
        });
        showToast('✅ FAQ добавлен', 'success');
        toggleFaqForm();
        loadFaq();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function deleteFaq(id) {
    if (!confirm('Удалить FAQ?')) return;
    try {
        await apiRequest(`/api/faq/${id}`, { method: 'DELETE' });
        showToast('🗑️ FAQ удален', 'info');
        loadFaq();
    } catch (error) {
        showToast('Ошибка удаления', 'error');
    }
}

async function loadBannedUsers() {
    const list = $('adminBannedList');
    if (!list) return;
    try {
        const data = await apiRequest('/api/banned');
        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Забаненных нет</p></div>';
            return;
        }
        list.innerHTML = data.map(b => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">🚫 ${b.user_id}</div>
                    <div class="admin-list-item-sub">${b.reason || 'Без причины'} · ${b.banned_at ? new Date(b.banned_at).toLocaleString() : ''}</div>
                </div>
                <div class="admin-list-actions">
                    <button class="edit-btn" onclick="unbanUser(${b.user_id})"><i class="fas fa-check"></i></button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
}

async function banUser() {
    const userId = parseInt($('banUserId').value);
    const reason = $('banReason').value.trim() || 'Нарушение правил';
    if (!userId) {
        showToast('Введите ID пользователя', 'error');
        return;
    }
    try {
        await apiRequest(`/api/banned/${userId}?reason=${encodeURIComponent(reason)}`, { method: 'POST' });
        showToast(`🚫 Пользователь ${userId} забанен`, 'info');
        $('banUserId').value = '';
        $('banReason').value = '';
        loadBannedUsers();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function unbanUser(userId) {
    if (!confirm(`Разбанить ${userId}?`)) return;
    try {
        await apiRequest(`/api/banned/${userId}`, { method: 'DELETE' });
        showToast(`✅ Пользователь ${userId} разбанен`, 'success');
        loadBannedUsers();
    } catch (error) {
        showToast('Ошибка', 'error');
    }
}

async function loadSettings() {
    try {
        const data = await apiRequest('/api/settings');
        if (data) {
            const map = {
                settingShopName: data.shop_name || '',
                settingShopDesc: data.shop_description || '',
                settingContactManager: data.contact_manager || '@ManaReaper',
                settingDelivery: data.delivery_info || '',
                settingPayment: data.payment_info || '',
                settingMaintenance: data.maintenance_mode || 'false',
                settingReviewsChannel: data.reviews_channel || ''
            };
            Object.keys(map).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = map[id];
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
    }
}

async function saveSettings() {
    const data = {
        shop_name: $('settingShopName').value.trim(),
        shop_description: $('settingShopDesc').value.trim(),
        contact_manager: $('settingContactManager').value.trim(),
        delivery_info: $('settingDelivery').value.trim(),
        payment_info: $('settingPayment').value.trim(),
        maintenance_mode: $('settingMaintenance').value,
        reviews_channel: $('settingReviewsChannel').value.trim()
    };
    try {
        await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
        showToast('💾 Настройки сохранены', 'success');
    } catch (error) {
        showToast('Ошибка сохранения', 'error');
    }
}

async function loadTelegramReviews() {
    const list = $('adminReviewsList');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Загрузка отзывов...</div>';
    try {
        const data = await apiRequest('/api/reviews/telegram');
        if (data.error) {
            list.innerHTML = `<div class="empty-state"><p>⚠️ Ошибка: ${data.error}</p></div>`;
            return;
        }
        const reviews = data.reviews || [];
        if (reviews.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Отзывов не найдено</p></div>';
            return;
        }
        list.innerHTML = reviews.map(r => `
            <div class="admin-list-item">
                <div class="admin-list-item-info">
                    <div class="admin-list-item-title">📝 ${escapeHtml(r.text.substring(0, 100))}${r.text.length > 100 ? '...' : ''}</div>
                    <div class="admin-list-item-sub">${r.date ? new Date(r.date).toLocaleString() : 'Дата не указана'} · 👁️ ${r.views || 0}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<div class="empty-state"><p>Ошибка загрузки отзывов</p></div>';
    }
}

function openSendAll() {
    const modal = $('sendAllModal');
    if (modal) modal.classList.add('open');
}

function closeSendAll() {
    const modal = $('sendAllModal');
    if (modal) {
        modal.classList.remove('open');
        const text = $('sendAllText');
        if (text) text.value = '';
    }
}

async function sendAll() {
    const text = $('sendAllText')?.value.trim();
    if (!text) {
        showToast('Введите текст рассылки', 'error');
        return;
    }
    if (!confirm(`Отправить рассылку ${text.length} символов всем пользователям?`)) return;
    try {
        await apiRequest('/api/send_all', { method: 'POST', body: JSON.stringify({ text }) });
        showToast('📨 Рассылка отправлена!', 'success');
        closeSendAll();
    } catch (error) {
        showToast('Ошибка отправки', 'error');
    }
}

async function init() {
    tg.ready();
    if (isAdmin()) {
        adminToggleBtn.style.display = 'flex';
        adminToggleBtn.innerHTML = '<i class="fas fa-crown"></i>';
    }
    await loadCategories();
    await loadProducts(true);
    await loadCart();
    searchToggle?.addEventListener('click', toggleSearch);
    searchClear?.addEventListener('click', clearSearch);
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 0;
            hasMore = true;
            productsGrid.innerHTML = '';
            loadProducts(true);
            searchContainer.classList.remove('open');
        }
    });
    cartBtn?.addEventListener('click', openCart);
    cartClose?.addEventListener('click', closeCart);
    cartOverlay?.addEventListener('click', closeCart);
    checkoutBtn?.addEventListener('click', checkoutFromCart);
    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    orderModalClose?.addEventListener('click', closeOrderModal);
    orderModalOverlay?.addEventListener('click', (e) => {
        if (e.target === orderModalOverlay) closeOrderModal();
    });
    orderCloseBtn?.addEventListener('click', closeOrderModal);
    submitOrderBtn?.addEventListener('click', submitOrder);
    promoApplyBtn?.addEventListener('click', applyPromo);
    orderPromo?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyPromo();
    });
    loadMoreBtn?.addEventListener('click', loadMore);
    adminToggleBtn?.addEventListener('click', toggleAdminMode);
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchAdminTab(btn.dataset.tab);
        });
    });
    $('addProductBtn')?.addEventListener('click', toggleProductForm);
    $('productFormCancel')?.addEventListener('click', toggleProductForm);
    $('productFormSubmit')?.addEventListener('click', saveProduct);
    $('addCategoryBtn')?.addEventListener('click', toggleCategoryForm);
    $('categoryFormCancel')?.addEventListener('click', toggleCategoryForm);
    $('categoryFormSubmit')?.addEventListener('click', saveCategory);
    $('addPromoBtn')?.addEventListener('click', togglePromoForm);
    $('promoFormCancel')?.addEventListener('click', togglePromoForm);
    $('promoFormSubmit')?.addEventListener('click', savePromo);
    $('addFaqBtn')?.addEventListener('click', toggleFaqForm);
    $('faqFormCancel')?.addEventListener('click', toggleFaqForm);
    $('faqFormSubmit')?.addEventListener('click', saveFaq);
    $('banUserBtn')?.addEventListener('click', banUser);
    $('settingsSaveBtn')?.addEventListener('click', saveSettings);
    $('sendAllBtn')?.addEventListener('click', openSendAll);
    $('sendAllClose')?.addEventListener('click', closeSendAll);
    $('sendAllSubmit')?.addEventListener('click', sendAll);
    $('adminSearchInput')?.addEventListener('input', () => {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(loadAdminProducts, 300);
    });
    $('adminCategoryFilter')?.addEventListener('change', loadAdminProducts);
    $('orderStatusFilter')?.addEventListener('change', loadAdminOrders);
    $('confirmCancel')?.addEventListener('click', () => {
        $('confirmModal')?.classList.remove('open');
    });
    $('confirmOk')?.addEventListener('click', () => {
        $('confirmModal')?.classList.remove('open');
        if (window._confirmAction) {
            window._confirmAction();
            window._confirmAction = null;
        }
    });
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get('start');
    if (startParam && startParam.startsWith('product_')) {
        const productId = parseInt(startParam.replace('product_', ''));
        if (productId) {
            setTimeout(() => openProduct(productId), 500);
        }
    }
    console.log('🚀 FAKESHOP Mini App инициализирован');
    console.log(`👤 User ID: ${USER_ID}`);
    console.log(`👑 Админ: ${isAdmin() ? 'ДА' : 'НЕТ'}`);
}

document.addEventListener('DOMContentLoaded', init);
