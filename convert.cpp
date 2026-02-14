#include<iostream>
using namespace std;
int main(){
    string s;
    getline(cin,s);
    for(auto x :s){
        if(x == 'n'){
            cout<<"\"none\",";
        }
        else if(x == 'd'){
            cout<<"\"defuse\",";
        }
        else if(x == 'e'){
            cout<<"\"elim\",";
        }
        else if(x == 'b'){
            cout<<"\"boom\",";
        }
        else if (x == 't') {
            cout<<"\"time\",";
        }
    }
}
