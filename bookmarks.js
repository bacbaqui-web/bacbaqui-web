export function initBookmarks({
  addGenericBookmark,
  deleteImage,
  updateBookmarkTitle,
  setBookmarkPreviewImage
}) {

  const grid = document.getElementById("image-grid");
  const dragArea = document.getElementById("drag-area");

  const modal = document.getElementById("editModal");
  const editTitleInput = document.getElementById("editTitleInput");
  const previewDropArea = document.getElementById("previewDropArea");
  const editSaveBtn = document.getElementById("editSaveBtn");
  const editCancelBtn = document.getElementById("editCancelBtn");

  let currentEditing = null;
  let currentFile = null;

  function openEdit(bookmark) {
    currentEditing = bookmark;
    editTitleInput.value = bookmark.title || "";
    modal.classList.remove("hidden");
  }

  function closeEdit() {
    modal.classList.add("hidden");
    currentEditing = null;
    currentFile = null;
  }

  editCancelBtn.onclick = closeEdit;

  editSaveBtn.onclick = async () => {
    if (!currentEditing) return;

    await updateBookmarkTitle(currentEditing.id, editTitleInput.value);

    if (currentFile) {
      await setBookmarkPreviewImage(currentEditing.id, currentFile);
    }

    closeEdit();
  };

  previewDropArea.addEventListener("paste", e => {
    const file = e.clipboardData.files[0];
    if (file) currentFile = file;
  });

  previewDropArea.addEventListener("drop", e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) currentFile = file;
  });

  previewDropArea.addEventListener("dragover", e => e.preventDefault());

  dragArea.addEventListener("paste", e => {
    const text = e.clipboardData.getData("text");
    if (text) addGenericBookmark(text);
  });

  function render(data) {
    grid.innerHTML = "";

    data.forEach(b => {
      const card = document.createElement("div");
      card.className = "bookmark-card";

      card.innerHTML = `
        ${b.previewImageUrl
          ? `<img src="${b.previewImageUrl}">`
          : `<div style="height:180px;display:flex;align-items:center;justify-content:center;font-size:22px;">🔗</div>`}

        <div class="bookmark-actions">
          <button data-edit>✏️</button>
          <button data-delete>❌</button>
        </div>

        <div class="p-3 text-sm">${b.title || b.pageUrl}</div>
      `;

      card.querySelector("[data-delete]").onclick = () => deleteImage(b.id);
      card.querySelector("[data-edit]").onclick = () => openEdit(b);

      grid.appendChild(card);
    });
  }

  return { render };
}
