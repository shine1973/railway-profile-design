const viewer=document.getElementById('viewer'),large=document.getElementById('largeImage');
document.querySelectorAll('button.image').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');large.src=image.src;large.alt=image.alt;viewer.showModal();}));
document.getElementById('closeImage').addEventListener('click',()=>viewer.close());
viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
