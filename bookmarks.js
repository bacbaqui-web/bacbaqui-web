export function initBookmarks(){

  const imageGrid=document.getElementById('image-grid');

  window.renderImageBookmarks=function(){

    if(!imageGrid) return;

    imageGrid.innerHTML='';

    (window.imageBookmarks||[]).forEach(d=>{
      const card=document.createElement('div');
      card.className='bookmark-card';
      card.innerHTML=`
        <div class="content">
          <div style="padding:20px;text-align:center;">
            ${d.sourceDomain||'Bookmark'}
          </div>
        </div>
      `;
      imageGrid.appendChild(card);
    });
  }

  renderImageBookmarks();
}
