import itertools
c={'Bar':(4,3,1),'Cherry':(5,4,2),'Plum':(6,4,3),'Melon':(6,5,4),'Orange':(7,5,6),'Lemon':(8,6,6),'Blank':(28,37,42)}
three={'Bar':5000,'Cherry':1000,'Plum':200,'Melon':100,'Orange':50,'Lemon':25}
def pay(s):
    if s[0]==s[1]==s[2] and s[0] in three: return three[s[0]]
    n=s.count('Cherry')
    return 10 if n==2 else 2 if n==1 else 0
tot=hits=ret=0
for s in itertools.product(c,repeat=3):
    w=c[s[0]][0]*c[s[1]][1]*c[s[2]][2]; p=pay(s)
    tot+=w; ret+=w*p; hits+=w*(p>0)
print(tot,hits,ret,f"hit {hits/tot:.2%} RTP {ret/tot:.2%}")
