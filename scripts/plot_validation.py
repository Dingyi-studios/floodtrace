from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.tri import Triangulation

ROOT=Path(__file__).resolve().parents[1]
s=json.loads((ROOT/'app/public/data/surface.json').read_text());v=np.array(s['mesh']['vertices']);tr=np.array(s['mesh']['triangles']);d=np.array(s['depth']);stats=s['stats']
fig,axes=plt.subplots(1,2,figsize=(13,5.5),layout='constrained')
img=axes[0].tripcolor(Triangulation(v[:,0],v[:,1],tr),facecolors=np.ma.masked_where(d[22]<.05,d[22]),vmin=0,vmax=2,cmap='Blues')
axes[0].set_aspect('equal');axes[0].set_xlabel('Easting offset from 583200 (m)');axes[0].set_ylabel('Northing offset from 6132200 (m)');axes[0].set_title('Bellinge hypothetical surface depth / T+44 min');fig.colorbar(img,ax=axes[0],label='Cell-average depth (m)')
axes[1].plot([r['t']/60 for r in stats],[r['volume'] for r in stats],label='ANUGA stored volume',color='#347d80',lw=3)
axes[1].plot([r['t']/60 for r in stats],[r['expectedVolume'] for r in stats],label='Rain input / closed basin',color='#b68e4d',ls='--')
axes[1].set_title('Mass balance / no infiltration or drainage');axes[1].set_xlabel('Scenario time (min)');axes[1].set_ylabel('Water volume (m3)');axes[1].legend();axes[1].grid(alpha=.18)
fig.suptitle('Independent ANUGA 4.1.0 stress scenario, not a historical flood reconstruction',fontsize=11,color='#557460')
fig.savefig(ROOT/'validation/surface-depth-44min.png',dpi=160)
